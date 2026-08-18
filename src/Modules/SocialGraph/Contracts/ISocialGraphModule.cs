using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.SocialGraph.Contracts;

public sealed record FollowStartedIntegrationEvent(Guid RelationshipId, Guid ActorId, Guid RecipientId,
    long RelationshipVersion, bool RequiresApproval, DateTimeOffset OccurredAtUtc) : IDomainEvent;

public sealed record RelationshipLookup(Guid ActorId, Guid TargetId, bool IsFollowing, bool IsBlocked,
    bool IsBlockedByTarget, bool IsMuted, bool IsCloseFriend);

public interface ISocialGraphModule
{
    Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default);
    async Task<IReadOnlyDictionary<Guid, RelationshipLookup>> GetManyAsync(Guid actorId, IReadOnlySet<Guid> targetIds,
        CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<Guid, RelationshipLookup>();
        foreach (var targetId in targetIds.Take(100))
            result[targetId] = await GetAsync(actorId, targetId, cancellationToken);
        return result;
    }
    Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default);
    Task<bool> IsFollowNotificationCurrentAsync(Guid relationshipId, Guid actorId, Guid recipientId,
        long relationshipVersion, bool requiresApproval, CancellationToken cancellationToken = default) => Task.FromResult(false);
}
