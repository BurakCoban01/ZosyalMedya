using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Communities;

public sealed class CommunityLeaveTests
{
    [Fact]
    public void ActiveMemberCanLeaveButOwnerCannot()
    {
        var now = DateTimeOffset.UtcNow;
        var owner = new CommunityActorId(Guid.NewGuid());
        var member = new CommunityActorId(Guid.NewGuid());
        var community = Community.Create(CommunityId.New(), owner, "demo-community", "Demo Community", "Demo",
            CommunityVisibility.Public, now);
        community.RequestMembership(member, now);

        community.Leave(member, now.AddMinutes(1));

        Assert.False(community.HasActiveMember(member));
        Assert.Equal(MembershipStatus.Removed, community.Members.Single(x => x.UserId == member).Status);
        var error = Assert.Throws<DomainRuleException>(() => community.Leave(owner, now.AddMinutes(2)));
        Assert.Equal("communities.owner_leave_forbidden", error.Code);
    }

    [Fact]
    public void RemovedPublicMemberCanJoinAgain()
    {
        var now = DateTimeOffset.UtcNow;
        var owner = new CommunityActorId(Guid.NewGuid());
        var member = new CommunityActorId(Guid.NewGuid());
        var community = Community.Create(CommunityId.New(), owner, "repeatable-demo", "Repeatable Demo", "Demo",
            CommunityVisibility.Public, now);
        community.RequestMembership(member, now);
        community.Leave(member, now.AddMinutes(1));

        community.RequestMembership(member, now.AddMinutes(2));

        Assert.True(community.HasActiveMember(member));
    }
}
