using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Domain.Users;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Identity;

public sealed class UserAccountTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void RegisterNormalizesUniqueFieldsAndRaisesEvent()
    {
        var account = UserAccount.Register(UserId.New(), "  Deniz  ", "Deniz@Example.test ", "adaptive-hash", Now);
        Assert.Equal("DENIZ", account.NormalizedUsername);
        Assert.Equal("DENIZ@EXAMPLE.TEST", account.NormalizedEmail);
        Assert.Single(account.DomainEvents);
        Assert.Equal(1, account.Version);
    }

    [Fact]
    public void RepeatedFailuresTemporarilyLockAccount()
    {
        var account = UserAccount.Register(UserId.New(), "deniz", "deniz@example.test", "adaptive-hash", Now);
        for (var attempt = 0; attempt < 5; attempt++) account.RecordFailedLogin(Now);
        Assert.True(account.IsLocked(Now.AddMinutes(1)));
        Assert.False(account.IsLocked(Now.AddMinutes(16)));
    }

    [Fact]
    public void InvalidEmailUsesTypedDomainError()
    {
        var exception = Assert.Throws<DomainRuleException>(() =>
            UserAccount.Register(UserId.New(), "deniz", "invalid", "adaptive-hash", Now));
        Assert.Equal("identity.email_invalid", exception.Code);
    }

    [Fact]
    public void RecoveryCodeCanOnlyBeConsumedOnce()
    {
        var account = UserAccount.Register(UserId.New(), "deniz", "deniz@example.test", "adaptive-hash", Now);
        account.EnableMfa("protected", ["A", "B", "C", "D", "E"], Now);
        Assert.True(account.ConsumeRecoveryCode("C", Now.AddMinutes(1)));
        Assert.False(account.ConsumeRecoveryCode("C", Now.AddMinutes(2)));
        Assert.DoesNotContain("C", account.MfaRecoveryCodeHashes);
    }

    [Fact]
    public void ErasureRemovesDirectIdentifiersAndDisablesAuthenticationFactors()
    {
        var account = UserAccount.Register(UserId.New(), "deniz", "deniz@example.test", "adaptive-hash", Now);
        account.EnableMfa("protected", ["A", "B", "C", "D", "E"], Now);

        account.ErasePersonalData(Now.AddMinutes(1));

        Assert.StartsWith("silinmis-", account.Username, StringComparison.Ordinal);
        Assert.True(account.Username.Length <= 32);
        Assert.EndsWith("@erased.invalid", account.Email, StringComparison.Ordinal);
        Assert.Equal(AccountStatus.Deactivated, account.Status);
        Assert.False(account.MfaEnabled);
        Assert.Equal("ERASED", account.PasswordHash);
        Assert.Contains(account.DomainEvents, item => item is UserPersonalDataErased);
    }
}
