using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Communities.Domain.Communities;

public sealed partial class Community
{
    public void Leave(CommunityActorId actor, DateTimeOffset now)
    {
        EnsureActive();
        var member = RequireActiveMember(actor);
        if (member.Role == CommunityRole.Owner)
            throw new DomainRuleException("communities.owner_leave_forbidden",
                "Topluluk sahibi topluluktan ayrılamaz.");
        member.Remove(now);
        Touch(actor, "membership_left", "Üye topluluktan ayrıldı.", now);
    }
}
