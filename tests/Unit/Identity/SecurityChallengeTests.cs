using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.Modules.Identity.Domain.Users;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Identity;

public sealed class SecurityChallengeTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ChallengeIsSingleUseAndExpires()
    {
        var challenge = SecurityChallenge.Issue(SecurityChallengeId.New(), UserId.New(),
            SecurityChallengePurpose.ResetPassword, "HASH", Now, TimeSpan.FromMinutes(30));
        challenge.Consume(Now.AddMinutes(1));
        var reused = Assert.Throws<DomainRuleException>(() => challenge.Consume(Now.AddMinutes(2)));
        Assert.Equal("identity.challenge_consumed", reused.Code);

        var expired = SecurityChallenge.Issue(SecurityChallengeId.New(), UserId.New(),
            SecurityChallengePurpose.VerifyEmail, "HASH2", Now, TimeSpan.FromMinutes(1));
        Assert.Equal("identity.challenge_expired",
            Assert.Throws<DomainRuleException>(() => expired.Consume(Now.AddMinutes(1))).Code);
    }
}
