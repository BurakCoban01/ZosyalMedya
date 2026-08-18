using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Saved;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;

public sealed class MongoSavedContentRepository : ISavedContentRepository
{
    private static readonly object MappingLock = new(); private readonly IMongoCollection<SavedContent> collection;
    public MongoSavedContentRepository(IMongoDatabase db) { ConfigureMappings(); collection = db.GetCollection<SavedContent>("saved_content"); }
    public Task EnsureIndexesAsync(CancellationToken token) => collection.Indexes.CreateManyAsync([
        new(Builders<SavedContent>.IndexKeys.Ascending(x => x.OwnerId).Ascending(x => x.PostId).Ascending(x => x.Collection), new CreateIndexOptions { Unique = true, Name = "ux_saved" }),
        new(Builders<SavedContent>.IndexKeys.Ascending(x => x.OwnerId).Ascending(x => x.Collection).Descending(x => x.CreatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_saved_page" })], token);
    public async Task<SavedContent?> SelectAsync(Expression<Func<SavedContent, bool>> predicate, CancellationToken cancellationToken = default) { var rows = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return rows.SingleOrDefault(); }
    public async Task<IReadOnlyList<SavedContent>> ListByFilterAsync(Expression<Func<SavedContent, bool>> predicate, QueryOptions<SavedContent>? options = null, CancellationToken cancellationToken = default) => await collection.Find(predicate).SortByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Limit((options ?? new()).BoundedLimit).ToListAsync(cancellationToken);
    public async Task<IReadOnlyList<SavedContent>> ListPageAsync(SavedContentPageQuery request, CancellationToken cancellationToken = default)
    { var filter = Builders<SavedContent>.Filter.Eq(x => x.OwnerId, request.OwnerId); if (request.Collection is not null) filter &= Builders<SavedContent>.Filter.Eq(x => x.Collection, request.Collection); if (request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue) filter &= Builders<SavedContent>.Filter.Lt(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) | Builders<SavedContent>.Filter.Eq(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) & Builders<SavedContent>.Filter.Gt(x => x.Id, request.CursorId.Value); return await collection.Find(filter).SortByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Limit(Math.Clamp(request.Limit, 1, 100)).ToListAsync(cancellationToken); }
    public async Task<SavedContentId> CreateAsync(SavedContent entity, CancellationToken cancellationToken = default) { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("saved.duplicate", "İçerik koleksiyonda zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<SavedContent, bool>> predicate, SavedContent replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) { var filter = Builders<SavedContent>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<SavedContent>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, cancellationToken: cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<SavedContent, bool>> predicate, CancellationToken cancellationToken = default) => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    private static void ConfigureMappings() { lock (MappingLock) { if (!BsonClassMap.IsClassMapRegistered(typeof(SavedContentId))) BsonClassMap.RegisterClassMap<SavedContentId>(m => { m.AutoMap(); m.MapCreator(x => new SavedContentId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); }); if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<SavedContentId>))) BsonClassMap.RegisterClassMap<AggregateRoot<SavedContentId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); }); if (!BsonClassMap.IsClassMapRegistered(typeof(SavedContent))) BsonClassMap.RegisterClassMap<SavedContent>(m => { m.AutoMap(); m.MapMember(x => x.OwnerId).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); }); } }
}
