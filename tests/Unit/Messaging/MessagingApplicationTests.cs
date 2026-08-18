using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Messaging;

public sealed class MessagingApplicationTests
{
    private static readonly Guid Sender = Guid.NewGuid();
    private static readonly Guid Recipient = Guid.NewGuid();
    private static readonly Guid MediaId = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 8, 14, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SendRejectsForeignOrNonPrivateMediaBeforePersistence()
    {
        var conversation = NewConversation();
        var foreign = await Handler(conversation, new(MediaId, Guid.NewGuid(), "image/png", 12, "Private", "Ready", null))
            .HandleAsync(conversation.Id.Value, Sender, "Ek", [MediaId], null, default);
        var publicMedia = await Handler(conversation, new(MediaId, Sender, "image/png", 12, "Public", "Ready", null))
            .HandleAsync(conversation.Id.Value, Sender, "Ek", [MediaId], null, default);

        Assert.False(foreign.IsSuccess);
        Assert.Equal("messaging.media_invalid", foreign.Error.Code);
        Assert.False(publicMedia.IsSuccess);
        Assert.Equal("messaging.media_visibility_invalid", publicMedia.Error.Code);
    }

    [Fact]
    public async Task SendAcceptsReadyPrivateOwnerMediaAndReturnsTruthfulInitialReceiptState()
    {
        var conversation = NewConversation();
        var repository = new MessageRepository();
        var handler = new SendMessageHandler(new ConversationRepository(conversation), repository, new Graph(),
            new Clock(), new Media(new(MediaId, Sender, "image/png", 12, "Private", "Ready", null)));

        var result = await handler.HandleAsync(conversation.Id.Value, Sender, string.Empty, [MediaId], null, default);

        Assert.True(result.IsSuccess);
        Assert.Equal([MediaId], result.Value!.MediaIds);
        Assert.Equal("Sent", result.Value.DeliveryState);
        Assert.NotNull(repository.Created);
    }

    [Fact]
    public async Task SendRejectsMoreThanTenDistinctAttachmentsInsteadOfSilentlyTruncating()
    {
        var conversation = NewConversation();
        var ids = Enumerable.Range(0, 11).Select(_ => Guid.NewGuid()).ToArray();

        var result = await Handler(conversation, new(MediaId, Sender, "image/png", 12, "Private", "Ready", null))
            .HandleAsync(conversation.Id.Value, Sender, "Ekler", ids, null, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("messaging.media_limit", result.Error.Code);
    }

    [Fact]
    public async Task MessagingGrantDelegatesOnlyCommittedActiveMessageAccess()
    {
        var repository = new MessageRepository { MemberCanAccessMedia = true };
        var provider = new MessagingMediaAccessGrantProvider(repository);

        Assert.True(await provider.CanViewAsync(MediaId, Recipient));
        Assert.Equal((MediaId, Recipient), repository.LastAccessQuery);
    }

    private static SendMessageHandler Handler(Conversation conversation, MediaAccess? access) =>
        new(new ConversationRepository(conversation), new MessageRepository(), new Graph(), new Clock(), new Media(access));

    private static Conversation NewConversation() => Conversation.CreateDirect(ConversationId.New(), new(Sender), new(Recipient), Now);

    private sealed class Media(MediaAccess? access) : IMediaModule
    {
        public Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default) => Task.FromResult(access);
    }

    private sealed class Graph : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, false, false, false, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class Clock : IClock { public DateTimeOffset UtcNow => Now; }

    private sealed class ConversationRepository(Conversation conversation) : IConversationRepository
    {
        public Task<Conversation?> SelectAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult<Conversation?>(predicate.Compile()(conversation) ? conversation : null);
        public Task<IReadOnlyList<Conversation>> ListByFilterAsync(Expression<Func<Conversation, bool>> predicate, QueryOptions<Conversation>? options = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<ConversationId> CreateAsync(Conversation entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Conversation, bool>> predicate, Conversation replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Conversation?> FindDirectAsync(ConversationMemberId first, ConversationMemberId second, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<Conversation>> ListForMemberAsync(ConversationListQuery request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class MessageRepository : IMessageRepository
    {
        public Message? Created { get; private set; }
        public bool MemberCanAccessMedia { get; init; }
        public (Guid MediaId, Guid MemberId) LastAccessQuery { get; private set; }
        public Task<Message?> SelectAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult<Message?>(null);
        public Task<IReadOnlyList<Message>> ListByFilterAsync(Expression<Func<Message, bool>> predicate, QueryOptions<Message>? options = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<MessageId> CreateAsync(Message entity, CancellationToken cancellationToken = default) { Created = entity; return Task.FromResult(entity.Id); }
        public Task<bool> UpdateAsync(Expression<Func<Message, bool>> predicate, Message replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<Message>> ListPageAsync(MessagePageQuery request, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> CountUnreadAsync(ConversationId conversationId, Guid userId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> CanMemberAccessMediaAsync(Guid mediaId, Guid memberId, CancellationToken cancellationToken = default) { LastAccessQuery = (mediaId, memberId); return Task.FromResult(MemberCanAccessMedia); }
    }
}
