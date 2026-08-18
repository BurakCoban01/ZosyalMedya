namespace ZosyalMedya.Modules.Notifications.Contracts;

public sealed record EnqueueNotification(
    Guid RecipientId,
    Guid? ActorId,
    string Type,
    Guid? EntityId,
    string AggregationKey,
    string TitleTemplateKey,
    string BodyTemplateKey,
    int TemplateVersion,
    IReadOnlyDictionary<string, string> Arguments,
    string DeepLink,
    string? IdempotencyKey = null);

public interface INotificationsModule
{
    Task EnqueueAsync(EnqueueNotification notification, CancellationToken cancellationToken = default);
}
