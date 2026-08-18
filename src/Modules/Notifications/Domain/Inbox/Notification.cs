using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Notifications.Domain.Inbox;

public readonly record struct NotificationId(Guid Value) { public static NotificationId New() => new(Guid.NewGuid()); }
public readonly record struct NotificationRecipientId(Guid Value);
public enum NotificationKind { NewFollower, Reaction, Comment, Message, Moderation, Community, System }
public enum NotificationDeliveryState { Pending, Delivered, RetryScheduled, DeadLetter }

public sealed class Notification : AggregateRoot<NotificationId>
{
    private Notification() : base(default) { AggregationKey = TitleTemplateKey = BodyTemplateKey = DeepLink = LastError = string.Empty; Arguments = new Dictionary<string, string>(); }
    private Notification(NotificationId id, NotificationRecipientId recipientId, Guid? actorId, NotificationKind kind,
        Guid? entityId, string aggregationKey, string titleTemplateKey, string bodyTemplateKey, int templateVersion,
        IReadOnlyDictionary<string, string> arguments, string deepLink, string? idempotencyKey, DateTimeOffset now) : base(id)
    {
        RecipientId = recipientId; ActorId = actorId; Kind = kind; EntityId = entityId;
        AggregationKey = Require(aggregationKey, 160, "notifications.aggregation_key_invalid");
        TitleTemplateKey = Require(titleTemplateKey, 100, "notifications.template_invalid");
        BodyTemplateKey = Require(bodyTemplateKey, 100, "notifications.template_invalid");
        if (templateVersion < 1) throw new DomainRuleException("notifications.template_version_invalid", "Şablon sürümü pozitif olmalıdır.");
        TemplateVersion = templateVersion; Arguments = arguments.Take(20).ToDictionary(x => x.Key, x => x.Value);
        DeepLink = Require(deepLink, 500, "notifications.deep_link_invalid");
        IdempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : Require(idempotencyKey, 200, "notifications.idempotency_key_invalid"); Count = 1;
        DeliveryState = NotificationDeliveryState.Pending; CreatedAtUtc = now; UpdatedAtUtc = now; LastError = string.Empty; Version = 1;
    }

    public NotificationRecipientId RecipientId { get; private set; }
    public Guid? ActorId { get; private set; }
    public NotificationKind Kind { get; private set; }
    public Guid? EntityId { get; private set; }
    public string AggregationKey { get; private set; }
    public string TitleTemplateKey { get; private set; }
    public string BodyTemplateKey { get; private set; }
    public int TemplateVersion { get; private set; }
    public Dictionary<string, string> Arguments { get; private set; }
    public string DeepLink { get; private set; }
    public string? IdempotencyKey { get; private set; }
    public int Count { get; private set; }
    public DateTimeOffset? ReadAtUtc { get; private set; }
    public NotificationDeliveryState DeliveryState { get; private set; }
    public int DeliveryAttempts { get; private set; }
    public DateTimeOffset? NextAttemptAtUtc { get; private set; }
    public string LastError { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Notification Create(NotificationId id, NotificationRecipientId recipientId, Guid? actorId,
        NotificationKind kind, Guid? entityId, string aggregationKey, string titleTemplateKey, string bodyTemplateKey,
        int templateVersion, IReadOnlyDictionary<string, string> arguments, string deepLink, DateTimeOffset now, string? idempotencyKey = null)
    {
        if (recipientId.Value == Guid.Empty || actorId == recipientId.Value)
            throw new DomainRuleException("notifications.recipient_invalid", "Bildirim alıcısı geçersiz.");
        return new(id, recipientId, actorId, kind, entityId, aggregationKey, titleTemplateKey, bodyTemplateKey, templateVersion, arguments, deepLink, idempotencyKey, now);
    }

    public void Aggregate(Guid? latestActorId, IReadOnlyDictionary<string, string> arguments, DateTimeOffset now)
    {
        if (ReadAtUtc.HasValue) throw new DomainRuleException("notifications.already_read", "Okunmuş bildirim birleştirilemez.");
        Count = Math.Min(Count + 1, 999); ActorId = latestActorId; Arguments = arguments.Take(20).ToDictionary(x => x.Key, x => x.Value);
        DeliveryState = NotificationDeliveryState.Pending; NextAttemptAtUtc = null; LastError = string.Empty; Touch(now);
    }
    public void MarkRead(DateTimeOffset now) { if (ReadAtUtc.HasValue) return; ReadAtUtc = now; Touch(now); }
    public void MarkDelivered(DateTimeOffset now) { DeliveryState = NotificationDeliveryState.Delivered; NextAttemptAtUtc = null; LastError = string.Empty; DeliveryAttempts++; Touch(now); }
    public void ScheduleRetry(string error, DateTimeOffset nextAttemptAtUtc, DateTimeOffset now)
    {
        DeliveryAttempts++; LastError = Require(error, 500, "notifications.delivery_error_invalid");
        if (DeliveryAttempts >= 5) { DeliveryState = NotificationDeliveryState.DeadLetter; NextAttemptAtUtc = null; }
        else { DeliveryState = NotificationDeliveryState.RetryScheduled; NextAttemptAtUtc = nextAttemptAtUtc; }
        Touch(now);
    }
    private void Touch(DateTimeOffset now) { UpdatedAtUtc = now; Version++; }
    private static string Require(string value, int max, string code)
    { var normalized = value.Trim(); if (normalized.Length is 0 || normalized.Length > max) throw new DomainRuleException(code, "Bildirim alanı geçersiz."); return normalized; }
}
