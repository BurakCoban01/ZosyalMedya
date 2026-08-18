using System.Globalization;
using System.Text;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Notifications.Application.Ports;
using ZosyalMedya.Modules.Notifications.Contracts;
using ZosyalMedya.Modules.Notifications.Domain.Inbox;

namespace ZosyalMedya.Modules.Notifications.Application.Inbox;

public sealed record NotificationView(Guid Id, Guid? ActorId, string Type, Guid? EntityId, string TitleTemplateKey,
    string BodyTemplateKey, int TemplateVersion, IReadOnlyDictionary<string, string> Arguments, string DeepLink,
    int Count, bool IsRead, string DeliveryState, DateTimeOffset CreatedAtUtc, long Version);
public sealed record NotificationPage(IReadOnlyList<NotificationView> Items, string? NextCursor);

public sealed class NotificationsModule(INotificationRepository notifications, IRealtimeNotificationPublisher realtime, IClock clock) : INotificationsModule
{
    public async Task EnqueueAsync(EnqueueNotification notification, CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<NotificationKind>(notification.Type, true, out var kind)) kind = NotificationKind.System;
        var recipient = new NotificationRecipientId(notification.RecipientId);
        if (!string.IsNullOrWhiteSpace(notification.IdempotencyKey) &&
            await notifications.FindByIdempotencyKeyAsync(recipient, notification.IdempotencyKey, cancellationToken) is not null)
            return;
        var existing = await notifications.FindUnreadAggregationAsync(recipient, notification.AggregationKey, cancellationToken);
        Notification item;
        if (existing is not null && clock.UtcNow - existing.UpdatedAtUtc <= TimeSpan.FromHours(24))
        {
            var version = existing.Version; existing.Aggregate(notification.ActorId, notification.Arguments, clock.UtcNow);
            if (!await notifications.UpdateAsync(x => x.Id == existing.Id, existing, version, cancellationToken))
                throw new DomainRuleException("notifications.concurrency_conflict", "Bildirim eşzamanlı güncellendi.");
            item = existing;
        }
        else
        {
            item = Notification.Create(NotificationId.New(), recipient, notification.ActorId, kind, notification.EntityId,
                notification.AggregationKey, notification.TitleTemplateKey, notification.BodyTemplateKey, notification.TemplateVersion,
                notification.Arguments, notification.DeepLink, clock.UtcNow, notification.IdempotencyKey);
            await notifications.CreateAsync(item, cancellationToken);
        }
        await realtime.PublishAsync(notification.RecipientId, Map(item), cancellationToken);
    }
    internal static NotificationView Map(Notification item) => new(item.Id.Value, item.ActorId, item.Kind.ToString(), item.EntityId,
        item.TitleTemplateKey, item.BodyTemplateKey, item.TemplateVersion, item.Arguments, item.DeepLink, item.Count,
        item.ReadAtUtc.HasValue, item.DeliveryState.ToString(), item.CreatedAtUtc, item.Version);
}

public sealed class ListNotificationsHandler(INotificationRepository notifications)
{
    public async Task<NotificationPage> HandleAsync(Guid recipientId, int limit, string? cursor, CancellationToken cancellationToken)
    {
        limit = Math.Clamp(limit, 1, 100); var decoded = Decode(cursor);
        var items = await notifications.ListPageAsync(new(new(recipientId), decoded.Time, decoded.Id, limit), cancellationToken);
        return new(items.Select(NotificationsModule.Map).ToArray(), items.Count == limit ? Encode(items[^1]) : null);
    }
    private static string Encode(Notification item) => Convert.ToBase64String(Encoding.UTF8.GetBytes($"{item.CreatedAtUtc.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{item.Id.Value:D}"));
    private static (DateTimeOffset? Time, NotificationId? Id) Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, null);
        try { var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|'); return (new(long.Parse(parts[0], CultureInfo.InvariantCulture), TimeSpan.Zero), new(Guid.Parse(parts[1]))); }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException) { throw new DomainRuleException("notifications.cursor_invalid", "Bildirim imleci geçersiz."); }
    }
}

public sealed class MarkNotificationReadHandler(INotificationRepository notifications, IClock clock)
{
    public async Task<Result<NotificationView>> HandleAsync(Guid id, Guid actorId, CancellationToken cancellationToken)
    {
        var item = await notifications.SelectAsync(x => x.Id == new NotificationId(id), cancellationToken);
        if (item is null) return Result.Failure<NotificationView>("notifications.not_found", "Bildirim bulunamadı.");
        if (item.RecipientId != new NotificationRecipientId(actorId)) return Result.Failure<NotificationView>("notifications.forbidden", "Bu bildirim başka kullanıcıya ait.");
        var version = item.Version; item.MarkRead(clock.UtcNow);
        if (item.Version != version && !await notifications.UpdateAsync(x => x.Id == item.Id, item, version, cancellationToken))
            return Result.Failure<NotificationView>("notifications.concurrency_conflict", "Bildirim eşzamanlı güncellendi.");
        return Result.Success(NotificationsModule.Map(item));
    }
}
