namespace ZosyalMedya.Modules.Messaging.Contracts;

using ZosyalMedya.BuildingBlocks.Domain;

public sealed record MessageSentIntegrationEvent(Guid MessageId, Guid ConversationId, Guid SenderId,
    IReadOnlyList<Guid> RecipientIds, string Preview, DateTimeOffset OccurredAtUtc) : IDomainEvent;

public sealed record MessageNotification(
    Guid MessageId,
    Guid ConversationId,
    Guid SenderId,
    IReadOnlyList<Guid> RecipientIds,
    string Preview,
    DateTimeOffset SentAtUtc);

public interface IMessagingModule
{
    Task<bool> IsConversationMemberAsync(
        Guid conversationId,
        Guid userId,
        CancellationToken cancellationToken = default);
}
