using System.Linq.Expressions;
using System.Diagnostics;
using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.MongoDb;

internal static class MongoMessagingMappings
{
    private static readonly object Lock = new();
    public static void Configure()
    {
        lock (Lock)
        {
            if (!BsonClassMap.IsClassMapRegistered(typeof(ConversationId))) BsonClassMap.RegisterClassMap<ConversationId>(m => { m.AutoMap(); m.MapCreator(x => new ConversationId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ConversationMemberId))) BsonClassMap.RegisterClassMap<ConversationMemberId>(m => { m.AutoMap(); m.MapCreator(x => new ConversationMemberId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(MessageId))) BsonClassMap.RegisterClassMap<MessageId>(m => { m.AutoMap(); m.MapCreator(x => new MessageId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(MessageSenderId))) BsonClassMap.RegisterClassMap<MessageSenderId>(m => { m.AutoMap(); m.MapCreator(x => new MessageSenderId(x.Value)); m.MapMember(x => x.Value).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<ConversationId>))) BsonClassMap.RegisterClassMap<AggregateRoot<ConversationId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(AggregateRoot<MessageId>))) BsonClassMap.RegisterClassMap<AggregateRoot<MessageId>>(m => { m.AutoMap(); m.MapIdMember(x => x.Id); m.UnmapMember(x => x.DomainEvents); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(ConversationMember))) BsonClassMap.RegisterClassMap<ConversationMember>(m => m.AutoMap());
            if (!BsonClassMap.IsClassMapRegistered(typeof(MessageReceipt))) BsonClassMap.RegisterClassMap<MessageReceipt>(m => { m.AutoMap(); m.MapMember(x => x.UserId).SetSerializer(new GuidSerializer(GuidRepresentation.Standard)); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Conversation))) BsonClassMap.RegisterClassMap<Conversation>(m => { m.AutoMap(); m.UnmapMember(x => x.Members); m.MapField("_members").SetElementName("members"); });
            if (!BsonClassMap.IsClassMapRegistered(typeof(Message))) BsonClassMap.RegisterClassMap<Message>(m => { m.AutoMap(); m.SetIgnoreExtraElements(true); m.UnmapMember(x => x.Receipts); m.MapField("_receipts").SetElementName("receipts"); m.MapMember(x => x.MediaIds).SetSerializer(new ArraySerializer<Guid>(new GuidSerializer(GuidRepresentation.Standard))); });
        }
    }
}

public sealed class MongoConversationRepository : IConversationRepository
{
    private readonly IMongoCollection<Conversation> collection;
    public MongoConversationRepository(IMongoDatabase database) { MongoMessagingMappings.Configure(); collection = database.GetCollection<Conversation>("conversations"); }
    public Task EnsureIndexesAsync(CancellationToken cancellationToken) => collection.Indexes.CreateManyAsync([
        new(Builders<Conversation>.IndexKeys.Ascending("members.UserId").Descending(x => x.UpdatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_member_inbox" }),
        new(Builders<Conversation>.IndexKeys.Ascending(x => x.Kind).Ascending("members.UserId"), new CreateIndexOptions { Name = "ix_direct_members" })], cancellationToken);
    public async Task<Conversation?> SelectAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default)
    { var values = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return values.SingleOrDefault(); }
    public async Task<IReadOnlyList<Conversation>> ListByFilterAsync(Expression<Func<Conversation, bool>> predicate, QueryOptions<Conversation>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await collection.Find(predicate).SortByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id).Limit(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<ConversationId> CreateAsync(Conversation entity, CancellationToken cancellationToken = default)
    { try { await collection.InsertOneAsync(entity, cancellationToken: cancellationToken); return entity.Id; } catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey) { throw new PersistenceConflictException("messaging.conversation_conflict", "Konuşma zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Conversation, bool>> predicate, Conversation replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var filter = Builders<Conversation>.Filter.Where(predicate); if (expectedVersion.HasValue) filter &= Builders<Conversation>.Filter.Eq(x => x.Version, expectedVersion.Value); return (await collection.ReplaceOneAsync(filter, replacement, cancellationToken: cancellationToken)).ModifiedCount == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default) => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    public async Task<Conversation?> FindDirectAsync(ConversationMemberId first, ConversationMemberId second, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Conversation>.Filter.Eq(x => x.Kind, ConversationKind.Direct) &
                     Builders<Conversation>.Filter.ElemMatch("members", Builders<ConversationMember>.Filter.Eq(x => x.UserId, first) & Builders<ConversationMember>.Filter.Eq(x => x.LeftAtUtc, null)) &
                     Builders<Conversation>.Filter.ElemMatch("members", Builders<ConversationMember>.Filter.Eq(x => x.UserId, second) & Builders<ConversationMember>.Filter.Eq(x => x.LeftAtUtc, null));
        return await collection.Find(filter).SingleOrDefaultAsync(cancellationToken);
    }
    public async Task<IReadOnlyList<Conversation>> ListForMemberAsync(ConversationListQuery request, CancellationToken cancellationToken = default)
    {
        var member = Builders<ConversationMember>.Filter.Eq(x => x.UserId, request.MemberId) & Builders<ConversationMember>.Filter.Eq(x => x.LeftAtUtc, null);
        var filter = Builders<Conversation>.Filter.ElemMatch("members", member);
        if (request.CursorUpdatedAtUtc.HasValue && request.CursorId.HasValue)
            filter &= Builders<Conversation>.Filter.Lt(x => x.UpdatedAtUtc, request.CursorUpdatedAtUtc.Value) |
                      Builders<Conversation>.Filter.Eq(x => x.UpdatedAtUtc, request.CursorUpdatedAtUtc.Value) & Builders<Conversation>.Filter.Gt(x => x.Id, request.CursorId.Value);
        return await collection.Find(filter).Sort(Builders<Conversation>.Sort.Descending(x => x.UpdatedAtUtc).Ascending(x => x.Id)).Limit(Math.Clamp(request.Limit, 1, 50)).ToListAsync(cancellationToken);
    }
}

public sealed class MongoMessageRepository : IMessageRepository
{
    private readonly IMongoCollection<Message> collection;
    private readonly IMongoCollection<BsonDocument> rawCollection;
    private readonly IMongoDatabase database;
    private readonly TimeProvider timeProvider;
    public MongoMessageRepository(IMongoDatabase database) : this(database, TimeProvider.System) { }
    public MongoMessageRepository(IMongoDatabase database, TimeProvider timeProvider) { this.database = database; this.timeProvider = timeProvider; MongoMessagingMappings.Configure(); collection = database.GetCollection<Message>("messages"); rawCollection = database.GetCollection<BsonDocument>("messages"); }
    public Task EnsureIndexesAsync(CancellationToken cancellationToken) => collection.Indexes.CreateManyAsync([
        new(Builders<Message>.IndexKeys.Ascending(x => x.ConversationId).Descending(x => x.CreatedAtUtc).Ascending(x => x.Id), new CreateIndexOptions { Name = "ix_conversation_page" }),
        new(Builders<Message>.IndexKeys.Ascending("receipts.UserId").Ascending("receipts.ReadAtUtc"), new CreateIndexOptions { Name = "ix_unread" }),
        new(Builders<Message>.IndexKeys.Ascending("_pendingEvents.ProcessedAtUtc").Ascending("_pendingEvents.NextAttemptAtUtc"), new CreateIndexOptions { Name = "ix_embedded_outbox" })], cancellationToken);
    public async Task<Message?> SelectAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default)
    { var values = await collection.Find(predicate).Limit(2).ToListAsync(cancellationToken); return values.SingleOrDefault(); }
    public async Task<IReadOnlyList<Message>> ListByFilterAsync(Expression<Func<Message, bool>> predicate, QueryOptions<Message>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await collection.Find(predicate).SortByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Limit(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<MessageId> CreateAsync(Message entity, CancellationToken cancellationToken = default)
    {
        try
        {
            var document = entity.ToBsonDocument();
            var now = timeProvider.GetUtcNow();
            var correlationId = Activity.Current?.TraceId.ToString() ?? Guid.NewGuid().ToString("N");
            document["_pendingEvents"] = new BsonArray(entity.DomainEvents.Select(domainEvent =>
            {
                var eventType = domainEvent.GetType();
                return new BsonDocument
                {
                    ["Id"] = new BsonBinaryData(Guid.NewGuid(), GuidRepresentation.Standard),
                    ["Type"] = $"{eventType.FullName}:v1",
                    ["Payload"] = JsonSerializer.Serialize(domainEvent, eventType),
                    ["CorrelationId"] = correlationId,
                    ["OccurredAtUtc"] = domainEvent.OccurredAtUtc.UtcDateTime,
                    ["CreatedAtUtc"] = now.UtcDateTime,
                    ["NextAttemptAtUtc"] = now.UtcDateTime,
                    ["Attempts"] = 0,
                    ["LastError"] = string.Empty,
                    ["ProcessedAtUtc"] = BsonNull.Value,
                    ["DeadLetteredAtUtc"] = BsonNull.Value,
                    ["LockedBy"] = BsonNull.Value,
                    ["LockedUntilUtc"] = BsonNull.Value
                };
            }));
            await rawCollection.InsertOneAsync(document, cancellationToken: cancellationToken);
            entity.ClearDomainEvents();
            return entity.Id;
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        { throw new PersistenceConflictException("messaging.message_conflict", "Mesaj zaten var.", exception); }
    }
    public async Task<bool> UpdateAsync(Expression<Func<Message, bool>> predicate, Message replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Message>.Filter.Where(predicate);
        if (expectedVersion.HasValue) filter &= Builders<Message>.Filter.Eq(x => x.Version, expectedVersion.Value);
        var replacementDocument = replacement.ToBsonDocument();
        replacementDocument.Remove("_id");
        var update = new BsonDocumentUpdateDefinition<Message>(new BsonDocument("$set", replacementDocument));
        return (await collection.UpdateOneAsync(filter, update, cancellationToken: cancellationToken)).ModifiedCount == 1;
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default) => (await collection.DeleteManyAsync(predicate, cancellationToken)).DeletedCount;
    public async Task<IReadOnlyList<Message>> ListPageAsync(MessagePageQuery request, CancellationToken cancellationToken = default)
    {
        var filter = Builders<Message>.Filter.Eq(x => x.ConversationId, request.ConversationId);
        if (request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue)
            filter &= Builders<Message>.Filter.Lt(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) |
                      Builders<Message>.Filter.Eq(x => x.CreatedAtUtc, request.CursorCreatedAtUtc.Value) & Builders<Message>.Filter.Gt(x => x.Id, request.CursorId.Value);
        return await collection.Find(filter).Sort(Builders<Message>.Sort.Descending(x => x.CreatedAtUtc).Ascending(x => x.Id)).Limit(Math.Clamp(request.Limit, 1, 100)).ToListAsync(cancellationToken);
    }
    public Task<long> CountUnreadAsync(ConversationId conversationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var receipt = Builders<MessageReceipt>.Filter.Eq(x => x.UserId, userId) & Builders<MessageReceipt>.Filter.Eq(x => x.ReadAtUtc, null);
        return collection.CountDocumentsAsync(Builders<Message>.Filter.Eq(x => x.ConversationId, conversationId) & Builders<Message>.Filter.ElemMatch("receipts", receipt), cancellationToken: cancellationToken);
    }
    public async Task<bool> CanMemberAccessMediaAsync(Guid mediaId, Guid memberId, CancellationToken cancellationToken = default)
    {
        var conversations = database.GetCollection<Conversation>("conversations");
        var member = Builders<ConversationMember>.Filter.Eq(x => x.UserId, new ConversationMemberId(memberId)) &
                     Builders<ConversationMember>.Filter.Eq(x => x.LeftAtUtc, null);
        using var cursor = await conversations.Find(Builders<Conversation>.Filter.ElemMatch("members", member))
            .Project(x => x.Id).ToCursorAsync(cancellationToken);
        while (await cursor.MoveNextAsync(cancellationToken))
        {
            var conversationIds = cursor.Current.ToArray();
            if (conversationIds.Length == 0) continue;
            var messageFilter = Builders<Message>.Filter.Eq(x => x.Status, MessageStatus.Sent) &
                                Builders<Message>.Filter.AnyEq(x => x.MediaIds, mediaId) &
                                Builders<Message>.Filter.In(x => x.ConversationId, conversationIds);
            if (await collection.CountDocumentsAsync(messageFilter, new CountOptions { Limit = 1 }, cancellationToken) > 0)
                return true;
        }
        return false;
    }
}
