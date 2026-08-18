using System.Text.Json;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Notifications.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Delivery;

public sealed class FollowStartedNotificationConsumer(
    INotificationsModule notifications,
    IProfilesModule profiles,
    ISocialGraphModule socialGraph) : IIntegrationEventConsumer
{
    public string EventType => $"{typeof(FollowStartedIntegrationEvent).FullName}:v1";

    public async Task HandleAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        var follow = JsonSerializer.Deserialize<FollowStartedIntegrationEvent>(envelope.Payload)
            ?? throw new InvalidOperationException("FollowStarted olay gövdesi okunamadı.");
        if (!await socialGraph.IsFollowNotificationCurrentAsync(follow.RelationshipId, follow.ActorId,
                follow.RecipientId, follow.RelationshipVersion, follow.RequiresApproval, cancellationToken)) return;
        var actor = await profiles.FindByOwnerIdAsync(follow.ActorId, cancellationToken);
        var visibleActor = !follow.RequiresApproval && actor?.IsPrivate == true ? null : actor;
        var arguments = visibleActor is null
            ? new Dictionary<string, string> { ["followState"] = follow.RequiresApproval ? "Pending" : "Following" }
            : new Dictionary<string, string>
            {
                ["actorName"] = visibleActor.DisplayName,
                ["actorHandle"] = visibleActor.Handle,
                ["followState"] = follow.RequiresApproval ? "Pending" : "Following"
            };
        var deepLink = follow.RequiresApproval
            ? "/baglantilar?view=requests"
            : visibleActor is null ? "/baglantilar" : $"/profil/{Uri.EscapeDataString(visibleActor.Handle)}";
        await notifications.EnqueueAsync(new EnqueueNotification(
            follow.RecipientId, follow.ActorId, "NewFollower", follow.ActorId,
            $"follow:{follow.RelationshipId:N}:{follow.RecipientId:N}",
            follow.RequiresApproval ? "notification.follow_request.title" : "notification.follow.title",
            follow.RequiresApproval ? "notification.follow_request.body" : "notification.follow.body", 1,
            arguments, deepLink, $"follow:{follow.RelationshipId:N}:{follow.RelationshipVersion}"), cancellationToken);
    }
}
