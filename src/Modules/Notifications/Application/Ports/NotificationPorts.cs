using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Notifications.Domain.Inbox;

namespace ZosyalMedya.Modules.Notifications.Application.Ports;

public sealed record NotificationPageQuery(NotificationRecipientId RecipientId, DateTimeOffset? CursorCreatedAtUtc, NotificationId? CursorId, int Limit);
public interface INotificationRepository : IRepository<Notification, NotificationId>
{
    Task<Notification?> FindUnreadAggregationAsync(NotificationRecipientId recipientId, string aggregationKey, CancellationToken cancellationToken = default);
    Task<Notification?> FindByIdempotencyKeyAsync(NotificationRecipientId recipientId, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Notification>> ListPageAsync(NotificationPageQuery request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Notification>> ListDueDeliveriesAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken = default);
}
public interface INotificationChannel
{
    Task DeliverAsync(Notification notification, CancellationToken cancellationToken = default);
}
public interface IRealtimeNotificationPublisher
{
    Task PublishAsync(Guid recipientId, object payload, CancellationToken cancellationToken = default);
}
