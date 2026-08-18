using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

public readonly record struct RelationshipId(Guid Value)
{
    public static RelationshipId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public readonly record struct GraphUserId(Guid Value)
{
    public override string ToString() => Value.ToString("D");
}

public enum FollowState { None, Pending, Following }
public enum FollowRequestOutcome { Pending, Following, AlreadyPending, AlreadyFollowing }

public sealed class Relationship : AggregateRoot<RelationshipId>
{
    private Relationship() : base(default) { }

    private Relationship(RelationshipId id, GraphUserId actorId, GraphUserId targetId, DateTimeOffset now) : base(id)
    {
        if (actorId == targetId)
            throw new DomainRuleException("social_graph.self_relationship", "Kullanıcı kendisiyle ilişki kuramaz.");
        ActorId = actorId;
        TargetId = targetId;
        CreatedAtUtc = now;
        UpdatedAtUtc = now;
        Version = 1;
    }

    public GraphUserId ActorId { get; private set; }
    public GraphUserId TargetId { get; private set; }
    public FollowState FollowState { get; private set; }
    public bool IsBlocked { get; private set; }
    public bool IsMuted { get; private set; }
    public bool IsCloseFriend { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Relationship Create(RelationshipId id, GraphUserId actorId, GraphUserId targetId, DateTimeOffset now) =>
        new(id, actorId, targetId, now);

    public FollowRequestOutcome RequestFollow(bool targetIsPrivate, DateTimeOffset now)
    {
        if (IsBlocked)
            throw new DomainRuleException("social_graph.blocked", "Engellenmiş kullanıcı takip edilemez.");
        if (FollowState == FollowState.Following) return FollowRequestOutcome.AlreadyFollowing;
        if (FollowState == FollowState.Pending) return FollowRequestOutcome.AlreadyPending;
        FollowState = targetIsPrivate ? FollowState.Pending : FollowState.Following;
        Touch(now);
        Raise(new FollowStartedIntegrationEvent(Id.Value, ActorId.Value, TargetId.Value, Version,
            targetIsPrivate, now));
        return targetIsPrivate ? FollowRequestOutcome.Pending : FollowRequestOutcome.Following;
    }

    public void AcceptFollow(DateTimeOffset now)
    {
        if (IsBlocked || FollowState != FollowState.Pending)
            throw new DomainRuleException("social_graph.request_not_pending", "Bekleyen takip isteği bulunamadı.");
        FollowState = FollowState.Following;
        Touch(now);
    }

    public void Unfollow(DateTimeOffset now)
    {
        if (FollowState == FollowState.None && !IsCloseFriend) return;
        FollowState = FollowState.None;
        IsCloseFriend = false;
        Touch(now);
    }

    public void Block(DateTimeOffset now)
    {
        if (IsBlocked) return;
        IsBlocked = true;
        FollowState = FollowState.None;
        IsMuted = false;
        IsCloseFriend = false;
        Touch(now);
    }

    public void Unblock(DateTimeOffset now)
    {
        if (!IsBlocked) return;
        IsBlocked = false;
        Touch(now);
    }

    public void SetMuted(bool muted, DateTimeOffset now)
    {
        if (IsBlocked)
            throw new DomainRuleException("social_graph.blocked", "Engellenmiş ilişki ayrıca sessize alınamaz.");
        if (IsMuted == muted) return;
        IsMuted = muted;
        Touch(now);
    }

    public void SetCloseFriend(bool closeFriend, DateTimeOffset now)
    {
        if (closeFriend && FollowState != FollowState.Following)
            throw new DomainRuleException("social_graph.close_friend_requires_follow", "Yakın arkadaş için aktif takip gerekir.");
        if (IsCloseFriend == closeFriend) return;
        IsCloseFriend = closeFriend;
        Touch(now);
    }

    private void Touch(DateTimeOffset now)
    {
        UpdatedAtUtc = now;
        Version++;
    }
}
