using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;

public sealed class MongoPostRepository : IPostRepository
{
    private static readonly object MappingLock = new(); private readonly IMongoCollection<Post> collection;
    public MongoPostRepository(IMongoDatabase database) { ConfigureMappings(); collection = database.GetCollection<Post>("posts"); }
    public Task EnsureIndexesAsync(CancellationToken cancellationToken) => collection.Indexes.CreateManyAsync([
        new(Builders<Post>.IndexKeys.Ascending(x => x.AuthorId).Ascending(x => x.Status).Descending(x => x.PublishedAtUtc), new CreateIndexOptions { Name = "ix_author_feed" }),
        new(Builders<Post>.IndexKeys.Ascending(x => x.Status).Ascending(x => x.Visibility).Descending(x => x.PublishedAtUtc), new CreateIndexOptions { Name = "ix_discovery" }),
        new(Builders<Post>.IndexKeys.Ascending(x => x.OriginalPostId), new CreateIndexOptions { Name = "ix_original", Sparse = true })], cancellationToken);

    public async Task<IReadOnlyList<Post>> ListFeedPageAsync(
        PostFeedQuery request,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<Post>.Filter.Eq(x => x.Status, PostStatus.Published);
        if (request.PublicOnly)
            filter &= Builders<Post>.Filter.Eq(x => x.Visibility, PostVisibility.Public);
        else
            filter &= Builders<Post>.Filter.In(x => x.AuthorId, request.AuthorIds ?? new HashSet<ContentAuthorId>());

        if (request.CursorPublishedAtUtc.HasValue && request.CursorId.HasValue)
        {
            var older = Builders<Post>.Filter.Lt(x => x.PublishedAtUtc, request.CursorPublishedAtUtc.Value);
            var sameTimeAndLaterId = Builders<Post>.Filter.Eq(x => x.PublishedAtUtc, request.CursorPublishedAtUtc.Value) &
                                     Builders<Post>.Filter.Gt(x => x.Id, request.CursorId.Value);
            filter &= older | sameTimeAndLaterId;
        }

        var sort = Builders<Post>.Sort.Descending(x => x.PublishedAtUtc).Ascending(x => x.Id);
        return await collection.Find(filter)
            .Sort(sort)
            .Limit(Math.Clamp(request.Limit, 1, 100))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Post>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) => await collection.Find(x => x.Status == PostStatus.Scheduled && x.PublishAtUtc <= now)
        .SortBy(x => x.PublishAtUtc).ThenBy(x => x.Id).Limit(Math.Clamp(limit, 1, 200)).ToListAsync(cancellationToken);

    public async Task<Post?> SelectAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }

    public async Task<IReadOnlyList<Post>> ListByFilterAsync(Expression<Func<Post, bool>> predicate,
        QueryOptions<Post>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new(); var find = collection.Find(predicate); SortDefinition<Post> sort = Builders<Post>.Sort.Ascending(x => x.Id);
        if (options.Sort is { Count: > 0 })
        {
            var definitions = options.Sort.Select(x => x.Direction == ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending
                ? Builders<Post>.Sort.Ascending(x.KeySelector) : Builders<Post>.Sort.Descending(x.KeySelector)).ToList();
            definitions.Add(Builders<Post>.Sort.Ascending(x => x.Id)); sort = Builders<Post>.Sort.Combine(definitions);
        }
        return await find.Sort(sort).Limit(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<PostId> CreateAsync(Post entity, CancellationToken cancellationToken = default)
    { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("content.unique_conflict", "İçerik zaten kayıtlıdır.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Post, bool>> predicate, Post replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var filter = Builders<Post>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Post>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, new ReplaceOptions { IsUpsert = false }, cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default)
        => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(PostId))) BsonClassMap.RegisterClassMap<PostId>(m => { m.AutoMap(); m.MapCreator(x => new PostId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ContentAuthorId))) BsonClassMap.RegisterClassMap<ContentAuthorId>(m => { m.AutoMap(); m.MapCreator(x => new ContentAuthorId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<PostId>))) BsonClassMap.RegisterClassMap<AggregateRoot<PostId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(PostRevision))) BsonClassMap.RegisterClassMap<PostRevision>(m => m.AutoMap());
            if (!BsonClassMap.IsClassMapRegistered(typeof(Post))) BsonClassMap.RegisterClassMap<Post>(m => { m.AutoMap(); m.UnmapMember(x => x.Revisions); m.MapField("_revisions").SetElementName("revisions"); });
        }
    }
}
