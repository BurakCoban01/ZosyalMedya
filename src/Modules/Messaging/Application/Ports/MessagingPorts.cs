using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;

namespace ZosyalMedya.Modules.Messaging.Application.Ports;

public sealed record ConversationListQuery(ConversationMemberId MemberId, DateTimeOffset? CursorUpdatedAtUtc, ConversationId? CursorId, int Limit);
public sealed record MessagePageQuery(ConversationId ConversationId, DateTimeOffset? CursorCreatedAtUtc, MessageId? CursorId, int Limit);

public interface IConversationRepository : IRepository<Conversation, ConversationId>
{
    Task<Conversation?> FindDirectAsync(ConversationMemberId first, ConversationMemberId second, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Conversation>> ListForMemberAsync(ConversationListQuery request, CancellationToken cancellationToken = default);
}

public interface IMessageRepository : IRepository<Message, MessageId>
{
    Task<IReadOnlyList<Message>> ListPageAsync(MessagePageQuery request, CancellationToken cancellationToken = default);
    Task<long> CountUnreadAsync(ConversationId conversationId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> CanMemberAccessMediaAsync(Guid mediaId, Guid memberId, CancellationToken cancellationToken = default);
}

public interface IRealtimeMessagePublisher
{
    Task MessageSentAsync(MessageNotification notification, CancellationToken cancellationToken = default);
    Task ReceiptChangedAsync(Guid conversationId, Guid messageId, Guid userId, string state, DateTimeOffset atUtc, CancellationToken cancellationToken = default);
    Task MessageChangedAsync(Guid conversationId, Guid messageId, Guid senderId, string text,
        IReadOnlyList<Guid> mediaIds, Guid? replyToId, string status, string deliveryState,
        DateTimeOffset createdAtUtc, DateTimeOffset updatedAtUtc, long version,
        CancellationToken cancellationToken = default);
}
