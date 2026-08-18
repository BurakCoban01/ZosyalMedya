using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Modules.Stories.Infrastructure.Persistence.MongoDb;

public sealed class MongoStoryRepository : IStoryRepository
{
    private static readonly object MappingLock = new(); private readonly IMongoCollection<Story> collection;
    public MongoStoryRepository(IMongoDatabase database) { ConfigureMappings(); collection = database.GetCollection<Story>("stories"); }
    public Task EnsureIndexesAsync(CancellationToken token) => collection.Indexes.CreateManyAsync([
        new(Builders<Story>.IndexKeys.Ascending(x => x.MediaId), new CreateIndexOptions { Name = "ux_media", Unique = true }),
        new(Builders<Story>.IndexKeys.Ascending(x => x.Status).Ascending(x => x.ExpiresAtUtc).Descending(x => x.CreatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_active" }),
        new(Builders<Story>.IndexKeys.Ascending(x => x.OwnerId).Ascending(x => x.Status).Ascending(x => x.ExpiresAtUtc).Descending(x => x.CreatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_owner_active" })], token);
    public async Task<IReadOnlyList<Story>> ListPageAsync(StoryPageQuery query, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Story>.Filter.Eq(x => x.Status, StoryStatus.Active) & Builders<Story>.Filter.Gt(x => x.ExpiresAtUtc, query.Now);
        if (query.OwnerId.HasValue) filter &= Builders<Story>.Filter.Eq(x => x.OwnerId, query.OwnerId.Value);
        if (query.BeforeTime.HasValue && query.BeforeId.HasValue)
            filter &= Builders<Story>.Filter.Lt(x => x.CreatedAtUtc, query.BeforeTime.Value) |
                Builders<Story>.Filter.Eq(x => x.CreatedAtUtc, query.BeforeTime.Value) & Builders<Story>.Filter.Gt(x => x.Id, query.BeforeId.Value);
        return await collection.Find(filter).Sort(Builders<Story>.Sort.Descending(x => x.CreatedAtUtc).Ascending(x => x.Id))
            .Limit(Math.Clamp(query.Limit, 1, 100)).ToListAsync(cancellationToken);
    }
    public async Task<Story?> FindActiveByMediaAsync(Guid mediaId, DateTimeOffset now, CancellationToken cancellationToken = default) =>
        await collection.Find(x => x.MediaId == mediaId && x.Status == StoryStatus.Active && x.ExpiresAtUtc > now).SingleOrDefaultAsync(cancellationToken);
    public async Task<Story?> SelectAsync(Expression<Func<Story, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Story>> ListByFilterAsync(Expression<Func<Story, bool>> predicate,
        QueryOptions<Story>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await collection.Find(predicate).SortBy(x => x.Id).Limit(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<StoryId> CreateAsync(Story entity, CancellationToken cancellationToken = default)
    { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("stories.media_conflict", "Bu medya zaten bir hikâyeye bağlı.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Story, bool>> predicate, Story replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var filter = Builders<Story>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Story>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Story, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(StoryId))) BsonClassMap.RegisterClassMap<StoryId>(map => { map.AutoMap(); map.MapCreator(x => new StoryId(x.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(StoryOwnerId))) BsonClassMap.RegisterClassMap<StoryOwnerId>(map => { map.AutoMap(); map.MapCreator(x => new StoryOwnerId(x.Value)); map.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<StoryId>))) BsonClassMap.RegisterClassMap<AggregateRoot<StoryId>>(map => { map.AutoMap(); map.MapIdMember(x => x.Id); map.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Story))) BsonClassMap.RegisterClassMap<Story>(map => map.AutoMap());
        }
    }
}
