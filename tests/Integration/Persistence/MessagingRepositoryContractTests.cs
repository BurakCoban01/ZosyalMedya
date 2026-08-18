using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using MongoDB.Bson;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.Modules.Profiles.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class MessagingRepositoryContractTests
{
    protected abstract Task<(IConversationRepository Conversations, IMessageRepository Messages)> CreateRepositoriesAsync();

    [Fact]
    public async Task MembershipMessagePaginationReceiptAndUnreadBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var (conversations, messages) = await CreateRepositoriesAsync();
        var now = new DateTimeOffset(2026, 7, 12, 13, 0, 0, TimeSpan.Zero);
        var first = new ConversationMemberId(Guid.NewGuid()); var second = new ConversationMemberId(Guid.NewGuid());
        var conversation = Conversation.CreateDirect(ConversationId.New(), first, second, now);
        await conversations.CreateAsync(conversation);
        var reloadedConversation = await conversations.FindDirectAsync(first, second);
        Assert.NotNull(reloadedConversation); Assert.True(reloadedConversation.HasActiveMember(second));
        Assert.Single(await conversations.ListForMemberAsync(new(first, null, null, 10)));
        var conversationPage = await new ListConversationsHandler(conversations, messages,
                new ProfileStub(first.Value, second.Value))
            .HandleAsync(first.Value, 10, null, default);
        Assert.Equal("İkinci Kullanıcı", conversationPage.Items[0].Members.Single(x => x.UserId == second.Value).DisplayName);

        var mediaId = Guid.NewGuid();
        var message = Message.Create(MessageId.New(), conversation.Id, new(first.Value), "Kalıcı sözleşme", [mediaId], null, [first.Value, second.Value], now);
        await messages.CreateAsync(message);
        Assert.Equal(1, await messages.CountUnreadAsync(conversation.Id, second.Value));
        Assert.Single(await messages.ListPageAsync(new(conversation.Id, null, null, 10)));
        Assert.True(await messages.CanMemberAccessMediaAsync(mediaId, second.Value));
        Assert.False(await messages.CanMemberAccessMediaAsync(mediaId, Guid.NewGuid()));

        var secondMessage = Message.Create(MessageId.New(), conversation.Id, new(first.Value), "Aynı zamanlı ikinci mesaj", [], null, [first.Value, second.Value], now);
        await messages.CreateAsync(secondMessage);
        var firstPage = await messages.ListPageAsync(new(conversation.Id, null, null, 1));
        var secondPage = await messages.ListPageAsync(new(conversation.Id, firstPage[0].CreatedAtUtc, firstPage[0].Id, 1));
        Assert.Single(secondPage); Assert.NotEqual(firstPage[0].Id, secondPage[0].Id);

        var handler = new ListMessagesHandler(conversations, messages, new SilentRealtime(), new FixedClock(now.AddMinutes(1)));
        var visible = await handler.HandleAsync(conversation.Id.Value, second.Value, 10, null, default);
        Assert.True(visible.IsSuccess); Assert.Equal(2, visible.Value!.Items.Count);
        Assert.Equal(0, await messages.CountUnreadAsync(conversation.Id, second.Value));
        Assert.Equal(2, await messages.DeleteByFilterAsync(x => x.ConversationId == conversation.Id));
        Assert.Equal(1, await conversations.DeleteByFilterAsync(x => x.Id == conversation.Id));
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock { public DateTimeOffset UtcNow => now; }
    private sealed class ProfileStub(Guid first, Guid second) : IProfilesModule
    {
        private readonly Dictionary<Guid, ProfileLookup> profiles = new()
        {
            [first] = new(first, "birinci", "Birinci Kullanıcı", false, null, false),
            [second] = new(second, "ikinci", "İkinci Kullanıcı", false, null, false)
        };

        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(profiles.GetValueOrDefault(ownerId));

        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(
            IReadOnlySet<Guid> ownerIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyDictionary<Guid, ProfileLookup>>(
                profiles.Where(x => ownerIds.Contains(x.Key)).ToDictionary());
    }
    private sealed class SilentRealtime : IRealtimeMessagePublisher
    {
        public Task MessageSentAsync(MessageNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task ReceiptChangedAsync(Guid conversationId, Guid messageId, Guid userId, string state, DateTimeOffset atUtc, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task MessageChangedAsync(Guid conversationId, Guid messageId, Guid senderId, string text,
            IReadOnlyList<Guid> mediaIds, Guid? replyToId, string status, string deliveryState,
            DateTimeOffset createdAtUtc, DateTimeOffset updatedAtUtc, long version,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}

public sealed class PostgreSqlMessagingRepositoryContractTests : MessagingRepositoryContractTests
{
    protected override async Task<(IConversationRepository Conversations, IMessageRepository Messages)> CreateRepositoriesAsync()
    {
        var db = new MessagingDbContext(new DbContextOptionsBuilder<MessagingDbContext>().UseNpgsql(
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync();
        return (new PostgreSqlConversationRepository(db), new PostgreSqlMessageRepository(db));
    }
}

public sealed class MongoMessagingRepositoryContractTests : MessagingRepositoryContractTests
{
    protected override async Task<(IConversationRepository Conversations, IMessageRepository Messages)> CreateRepositoriesAsync()
    {
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var conversations = new MongoConversationRepository(database); var messages = new MongoMessageRepository(database);
        await conversations.EnsureIndexesAsync(CancellationToken.None); await messages.EnsureIndexesAsync(CancellationToken.None);
        return (conversations, messages);
    }

    [Fact]
    public async Task MessageAndIntegrationEventAreInsertedAtomicallyAndUpdatePreservesEvent()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var repository = new MongoMessageRepository(database);
        await repository.EnsureIndexesAsync(CancellationToken.None);
        var now = new DateTimeOffset(2026, 7, 12, 14, 0, 0, TimeSpan.Zero);
        var message = Message.Create(MessageId.New(), ConversationId.New(), new MessageSenderId(Guid.NewGuid()),
            "Dayanıklı olay", [], null, [Guid.NewGuid()], now);

        await repository.CreateAsync(message);

        Assert.Empty(message.DomainEvents);
        var raw = database.GetCollection<BsonDocument>("messages");
        var id = new BsonBinaryData(message.Id.Value, GuidRepresentation.Standard);
        var document = await raw.Find(Builders<BsonDocument>.Filter.Eq("_id.Value", id)).SingleAsync();
        Assert.Single(document["_pendingEvents"].AsBsonArray);
        Assert.EndsWith("MessageSentIntegrationEvent:v1",
            document["_pendingEvents"].AsBsonArray[0]["Type"].AsString, StringComparison.Ordinal);

        var version = message.Version;
        message.MarkDelivered(message.Receipts[0].UserId, now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == message.Id, message, version));
        document = await raw.Find(Builders<BsonDocument>.Filter.Eq("_id.Value", id)).SingleAsync();
        Assert.Single(document["_pendingEvents"].AsBsonArray);
        await repository.DeleteByFilterAsync(x => x.Id == message.Id);
    }
}
