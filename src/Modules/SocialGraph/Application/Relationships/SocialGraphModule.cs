using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

namespace ZosyalMedya.Modules.SocialGraph.Application.Relationships;

public sealed class SocialGraphModule(IRelationshipRepository relationships) : ISocialGraphModule
{
    public async Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default)
    {
        var actor = new GraphUserId(actorId); var target = new GraphUserId(targetId);
        var forward = await relationships.SelectAsync(x => x.ActorId == actor && x.TargetId == target, cancellationToken);
        var reverse = await relationships.SelectAsync(x => x.ActorId == target && x.TargetId == actor, cancellationToken);
        return new(actorId, targetId, forward?.FollowState == FollowState.Following, forward?.IsBlocked ?? false,
            reverse?.IsBlocked ?? false, forward?.IsMuted ?? false, forward?.IsCloseFriend ?? false);
    }

    public async Task<IReadOnlyDictionary<Guid, RelationshipLookup>> GetManyAsync(Guid actorId,
        IReadOnlySet<Guid> targetIds, CancellationToken cancellationToken = default)
    {
        if (targetIds.Count == 0) return new Dictionary<Guid, RelationshipLookup>();
        var actor = new GraphUserId(actorId);
        var targets = targetIds.Take(100).Select(id => new GraphUserId(id)).ToHashSet();
        var forward = await relationships.ListByFilterAsync(
            x => x.ActorId == actor && targets.Contains(x.TargetId), new QueryOptions<Relationship>(100), cancellationToken);
        var reverse = await relationships.ListByFilterAsync(
            x => targets.Contains(x.ActorId) && x.TargetId == actor, new QueryOptions<Relationship>(100), cancellationToken);
        var forwardMap = forward.ToDictionary(x => x.TargetId.Value);
        var reverseMap = reverse.ToDictionary(x => x.ActorId.Value);
        return targets.ToDictionary(target => target.Value, target =>
        {
            forwardMap.TryGetValue(target.Value, out var direct);
            reverseMap.TryGetValue(target.Value, out var back);
            return new RelationshipLookup(actorId, target.Value, direct?.FollowState == FollowState.Following,
                direct?.IsBlocked ?? false, back?.IsBlocked ?? false, direct?.IsMuted ?? false,
                direct?.IsCloseFriend ?? false);
        });
    }

    public async Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default)
    {
        var items = await relationships.ListByFilterAsync(
            x => x.ActorId == new GraphUserId(actorId) && x.FollowState == FollowState.Following && !x.IsBlocked,
            new QueryOptions<Relationship>(100, [new(x => x.TargetId, SortDirection.Ascending)]), cancellationToken);
        return items.Select(x => x.TargetId.Value).ToHashSet();
    }

    public async Task<bool> IsFollowNotificationCurrentAsync(Guid relationshipId, Guid actorId, Guid recipientId,
        long relationshipVersion, bool requiresApproval, CancellationToken cancellationToken = default)
    {
        var actor = new GraphUserId(actorId);var recipient = new GraphUserId(recipientId);
        var relationship = await relationships.SelectAsync(x => x.Id == new RelationshipId(relationshipId)
            && x.ActorId == actor && x.TargetId == recipient, cancellationToken);
        if (relationship is null || relationship.Version != relationshipVersion || relationship.IsBlocked
            || relationship.FollowState != (requiresApproval ? FollowState.Pending : FollowState.Following)) return false;
        var reverse = await relationships.SelectAsync(x => x.ActorId == recipient && x.TargetId == actor, cancellationToken);
        return reverse?.IsBlocked != true;
    }
}
