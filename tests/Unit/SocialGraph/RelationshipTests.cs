using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using Xunit;

namespace ZosyalMedya.Tests.Unit.SocialGraph;

public sealed class RelationshipTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void PrivateProfileCreatesPendingRequestThenAccepts()
    {
        var relationship = Create();
        Assert.Equal(FollowRequestOutcome.Pending, relationship.RequestFollow(true, Now));
        relationship.AcceptFollow(Now.AddMinutes(1));
        Assert.Equal(FollowState.Following, relationship.FollowState);
        relationship.SetCloseFriend(true, Now.AddMinutes(2));
        Assert.True(relationship.IsCloseFriend);
    }

    [Fact]
    public void BlockClearsEngagementStateAndPreventsFollow()
    {
        var relationship = Create();
        relationship.RequestFollow(false, Now);
        relationship.SetMuted(true, Now);
        relationship.SetCloseFriend(true, Now);
        relationship.Block(Now.AddMinutes(1));
        Assert.True(relationship.IsBlocked);
        Assert.Equal(FollowState.None, relationship.FollowState);
        Assert.False(relationship.IsMuted);
        Assert.False(relationship.IsCloseFriend);
        Assert.Throws<DomainRuleException>(() => relationship.RequestFollow(false, Now.AddMinutes(2)));
    }

    [Fact]
    public void SelfRelationshipIsRejected()
    {
        var user = new GraphUserId(Guid.NewGuid());
        var exception = Assert.Throws<DomainRuleException>(() => Relationship.Create(RelationshipId.New(), user, user, Now));
        Assert.Equal("social_graph.self_relationship", exception.Code);
    }

    private static Relationship Create() => Relationship.Create(RelationshipId.New(), new GraphUserId(Guid.NewGuid()), new GraphUserId(Guid.NewGuid()), Now);
}
