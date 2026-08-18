using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Reactions.Application.Ports;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;

namespace ZosyalMedya.Modules.Reactions.Infrastructure.Persistence.MongoDb;
public sealed class MongoReactionRepository : IReactionRepository
{
    private static readonly object Gate = new(); private readonly IMongoCollection<Reaction> collection;
    public MongoReactionRepository(IMongoDatabase database) { ConfigureMappings(); collection = database.GetCollection<Reaction>("reactions"); }
    public Task EnsureIndexesAsync(CancellationToken cancellationToken) => collection.Indexes.CreateManyAsync([
        new(Builders<Reaction>.IndexKeys.Ascending(x => x.ActorId).Ascending(x => x.ContentId), new CreateIndexOptions { Unique = true, Name = "ux_actor_content" }),
        new(Builders<Reaction>.IndexKeys.Ascending(x => x.ContentId).Ascending(x => x.IsActive).Ascending(x => x.Kind), new CreateIndexOptions { Name = "ix_summary" })], cancellationToken);
    public async Task<Reaction?> SelectAsync(Expression<Func<Reaction, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Reaction>> ListByFilterAsync(Expression<Func<Reaction, bool>> predicate, QueryOptions<Reaction>? options = null, CancellationToken cancellationToken = default)
        => await collection.Find(predicate).SortBy(x => x.Id).Limit((options ?? new()).BoundedLimit).ToListAsync(cancellationToken);
    public async Task<ReactionId> CreateAsync(Reaction entity, CancellationToken cancellationToken = default)
    { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("reactions.unique_conflict", "Bir aktör içerik için yalnız bir tepki kaydı oluşturabilir.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Reaction, bool>> predicate, Reaction replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var filter = Builders<Reaction>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Reaction>.Filter.Eq(x => x.Version, expectedVersion); return (await collection.ReplaceOneAsync(filter, replacement, new ReplaceOptions(), cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Reaction, bool>> predicate, CancellationToken cancellationToken = default)
        => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    public async Task<IReadOnlyDictionary<ReactionKind, long>> CountActiveByContentAsync(ReactedContentId contentId, CancellationToken cancellationToken = default)
    { var rows = await collection.Aggregate().Match(x => x.ContentId == contentId && x.IsActive).Group(x => x.Kind, group => new { Kind = group.Key, Count = group.LongCount() }).ToListAsync(cancellationToken); return rows.ToDictionary(x => x.Kind, x => x.Count); }
    private static void ConfigureMappings()
    {
        lock (Gate)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(ReactionId))) BsonClassMap.RegisterClassMap<ReactionId>(m => { m.AutoMap(); m.MapCreator(x => new ReactionId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ReactionActorId))) BsonClassMap.RegisterClassMap<ReactionActorId>(m => { m.AutoMap(); m.MapCreator(x => new ReactionActorId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ReactedContentId))) BsonClassMap.RegisterClassMap<ReactedContentId>(m => { m.AutoMap(); m.MapCreator(x => new ReactedContentId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<ReactionId>))) BsonClassMap.RegisterClassMap<AggregateRoot<ReactionId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Reaction))) BsonClassMap.RegisterClassMap<Reaction>(m => m.AutoMap());
        }
    }
}
