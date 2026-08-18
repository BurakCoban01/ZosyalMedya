using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Identity;

public sealed class UserSessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void RotationConsumesOldHashAndAdvancesVersion()
    {
        var session = Create();
        var outcome = session.Rotate("hash-1", "hash-2", Now.AddMinutes(1), Now.AddDays(30));
        Assert.Equal(RefreshRotationOutcome.Rotated, outcome);
        Assert.Contains("hash-1", session.ConsumedTokenHashes);
        Assert.Equal("hash-2", session.RefreshTokenHash);
        Assert.Equal(2, session.Version);
    }

    [Fact]
    public void ReusingConsumedTokenRevokesWholeSession()
    {
        var session = Create();
        session.Rotate("hash-1", "hash-2", Now.AddMinutes(1), Now.AddDays(30));
        var outcome = session.Rotate("hash-1", "hash-3", Now.AddMinutes(2), Now.AddDays(30));
        Assert.Equal(RefreshRotationOutcome.ReuseDetected, outcome);
        Assert.True(session.IsRevoked);
        Assert.Equal("refresh-token-reuse", session.RevocationReason);
    }

    [Fact]
    public void ExpiredSessionCannotRotate()
    {
        var session = UserSession.Start(SessionId.New(), UserId.New(), "device-1", "Telefon", "hash-1", Now, Now.AddMinutes(1));
        var outcome = session.Rotate("hash-1", "hash-2", Now.AddMinutes(2), Now.AddDays(30));
        Assert.Equal(RefreshRotationOutcome.Expired, outcome);
        Assert.True(session.IsRevoked);
    }

    private static UserSession Create() =>
        UserSession.Start(SessionId.New(), UserId.New(), "device-1", "Telefon", "hash-1", Now, Now.AddDays(30));
}
