using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;

public sealed class MongoPostImpressionRepository : IPostImpressionRepository
{
    private readonly IMongoCollection<MongoPostImpression> impressions; private readonly IMongoCollection<Post> posts;
    private readonly TimeProvider timeProvider;
    public MongoPostImpressionRepository(IMongoDatabase db) : this(db, TimeProvider.System) { }
    public MongoPostImpressionRepository(IMongoDatabase db, TimeProvider timeProvider)
    {
        this.timeProvider = timeProvider;
        if (!BsonClassMap.IsClassMapRegistered(typeof(PostId))) BsonClassMap.RegisterClassMap<PostId>(m => { m.AutoMap(); m.MapCreator(x => new PostId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
        if (!BsonClassMap.IsClassMapRegistered(typeof(MongoPostImpression))) BsonClassMap.RegisterClassMap<MongoPostImpression>(m => { m.AutoMap(); m.MapIdMember(x => x.Id).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
        impressions = db.GetCollection<MongoPostImpression>("post_impressions"); posts = db.GetCollection<Post>("posts");
    }
    public Task EnsureIndexesAsync(CancellationToken token) => impressions.Indexes.CreateOneAsync(new CreateIndexModel<MongoPostImpression>(Builders<MongoPostImpression>.IndexKeys.Ascending(x => x.PostId).Ascending(x => x.ViewerHash).Ascending(x => x.UtcDay), new() { Unique = true, Name = "ux_daily_view" }), cancellationToken: token);
    public async Task<bool> RecordUniqueAsync(PostId postId, string viewerHash, DateOnly utcDay, CancellationToken cancellationToken = default)
    {
        try { await impressions.InsertOneAsync(new MongoPostImpression(postId, viewerHash, utcDay, timeProvider.GetUtcNow()), cancellationToken: cancellationToken); }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { return false; }
        var result = await posts.UpdateOneAsync(x => x.Id == postId, Builders<Post>.Update.Inc(x => x.ViewCount, 1), cancellationToken: cancellationToken);
        if (result.ModifiedCount == 1) return true;
        await impressions.DeleteOneAsync(x => x.PostId == postId && x.ViewerHash == viewerHash && x.UtcDay == utcDay, cancellationToken);
        return false;
    }
}

public sealed class MongoPostImpression
{
    [BsonConstructor] public MongoPostImpression() { ViewerHash = string.Empty; }
    internal MongoPostImpression(PostId postId, string viewerHash, DateOnly utcDay, DateTimeOffset recordedAtUtc)
    { Id = Guid.NewGuid(); PostId = postId; ViewerHash = viewerHash; UtcDay = utcDay; RecordedAtUtc = recordedAtUtc; }
    public Guid Id { get; private set; } public PostId PostId { get; private set; } public string ViewerHash { get; private set; }
    public DateOnly UtcDay { get; private set; } public DateTimeOffset RecordedAtUtc { get; private set; }
}
