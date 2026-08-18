using System.Linq.Expressions;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Notifications.Application.Ports;
using ZosyalMedya.Modules.Notifications.Domain.Inbox;

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Persistence.MongoDb;

public sealed class MongoNotificationRepository : INotificationRepository
{
    private static readonly object MappingLock = new();
    private readonly IMongoCollection<Notification> collection;
    public MongoNotificationRepository(IMongoDatabase database) { ConfigureMappings(); collection = database.GetCollection<Notification>("inbox"); }
    public Task EnsureIndexesAsync(CancellationToken cancellationToken) => collection.Indexes.CreateManyAsync([
        new(Builders<Notification>.IndexKeys.Ascending(x => x.RecipientId).Descending(x => x.CreatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_inbox" }),
        new(Builders<Notification>.IndexKeys.Ascending(x => x.RecipientId).Ascending(x => x.AggregationKey).Ascending(x => x.ReadAtUtc), new CreateIndexOptions { Name = "ix_aggregation" }),
        new(Builders<Notification>.IndexKeys.Ascending(x => x.RecipientId).Ascending(x => x.IdempotencyKey), new CreateIndexOptions { Name = "ux_idempotency", Unique = true, Sparse = true }),
        new(Builders<Notification>.IndexKeys.Ascending(x => x.DeliveryState).Ascending(x => x.NextAttemptAtUtc), new CreateIndexOptions { Name = "ix_delivery" })], cancellationToken);

    public async Task<Notification?> SelectAsync(Expression<Func<Notification, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Notification>> ListByFilterAsync(Expression<Func<Notification, bool>> predicate,
        QueryOptions<Notification>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await collection.Find(predicate).SortByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Limit(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<NotificationId> CreateAsync(Notification entity, CancellationToken cancellationToken = default)
    { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("notifications.conflict", "Bildirim zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Notification, bool>> predicate, Notification replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var filter = Builders<Notification>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Notification>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, cancellationToken: cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Notification, bool>> predicate, CancellationToken cancellationToken = default) =>
        (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;

    public async Task<Notification?> FindUnreadAggregationAsync(NotificationRecipientId recipientId, string aggregationKey,
        CancellationToken cancellationToken = default) => await collection.Find(x => x.RecipientId == recipientId &&
        x.AggregationKey == aggregationKey && x.ReadAtUtc == null).SortByDescending(x => x.UpdatedAtUtc).FirstOrDefaultAsync(cancellationToken);

    public async Task<Notification?> FindByIdempotencyKeyAsync(NotificationRecipientId recipientId, string idempotencyKey,
        CancellationToken cancellationToken = default) => await collection.Find(x => x.RecipientId == recipientId &&
        x.IdempotencyKey == idempotencyKey).SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<Notification>> ListPageAsync(NotificationPageQuery request, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Notification>.Filter.Eq(x => x.RecipientId, request.RecipientId);
        if (request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue)
            filter &= Builders<Notification>.Filter.Lt(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) |
                      Builders<Notification>.Filter.Eq(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) &
                      Builders<Notification>.Filter.Gt(x => x.Id, request.CursorId.Value);
        return await collection.Find(filter).Sort(Builders<Notification>.Sort.Descending(x => x.CreatedAtUtc).Ascending(x => x.Id))
            .Limit(Math.Clamp(request.Limit, 1, 100)).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Notification>> ListDueDeliveriesAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<Notification>.Filter.Eq(x => x.DeliveryState, NotificationDeliveryState.Pending) |
                     Builders<Notification>.Filter.Eq(x => x.DeliveryState, NotificationDeliveryState.RetryScheduled) &
                     Builders<Notification>.Filter.Lte(x => x.NextAttemptAtUtc, now);
        return await collection.Find(filter).SortBy(x => x.NextAttemptAtUtc).ThenBy(x => x.CreatedAtUtc)
            .Limit(Math.Clamp(limit, 1, 100)).ToListAsync(cancellationToken);
    }

    private static void ConfigureMappings()
    {
        lock (MappingLock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(NotificationId))) BsonClassMap.RegisterClassMap<NotificationId>(m => { m.AutoMap(); m.MapCreator(x => new NotificationId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(NotificationRecipientId))) BsonClassMap.RegisterClassMap<NotificationRecipientId>(m => { m.AutoMap(); m.MapCreator(x => new NotificationRecipientId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<NotificationId>))) BsonClassMap.RegisterClassMap<AggregateRoot<NotificationId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Notification))) BsonClassMap.RegisterClassMap<Notification>(m => { m.AutoMap(); m.MapMember(x => x.ActorId).SetSerializer(new NullableSerializer<Guid>(new GuidSerializer(GuidRepresentation.Standard))); m.MapMember(x => x.EntityId).SetSerializer(new NullableSerializer<Guid>(new GuidSerializer(GuidRepresentation.Standard))); });
        }
    }
}
