using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Application.Security;

public sealed record ConfirmMfaResult(IReadOnlyList<string> RecoveryCodes);

public sealed class MfaFlows(
    IUserAccountRepository users,
    IMfaSecurityService security,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock)
{
    public async Task<Result<PendingMfaEnrollment>> BeginAsync(UserId userId, CancellationToken cancellationToken)
    {
        var account = await users.SelectAsync(x => x.Id == userId, cancellationToken);
        if (account is null) return Result.Failure<PendingMfaEnrollment>("identity.user_not_found", "Kullanıcı bulunamadı.");
        if (publicDemo.IsProtectedIdentity(account.Id)) return Protected<PendingMfaEnrollment>();
        if (account.MfaEnabled) return Result.Failure<PendingMfaEnrollment>("identity.mfa_already_enabled", "MFA zaten etkin.");
        return Result.Success(security.Begin(account, clock.UtcNow));
    }

    public async Task<Result<ConfirmMfaResult>> ConfirmAsync(UserId userId, string enrollmentToken, string code,
        CancellationToken cancellationToken)
    {
        if (!security.TryReadEnrollment(enrollmentToken, out var payload) || payload.UserId != userId ||
            payload.ExpiresAtUtc <= clock.UtcNow || !security.ValidateSecret(payload.Secret, code, clock.UtcNow))
            return Result.Failure<ConfirmMfaResult>("identity.mfa_code_invalid", "MFA kodu geçersiz.");
        var account = await users.SelectAsync(x => x.Id == userId, cancellationToken);
        if (account is null) return Result.Failure<ConfirmMfaResult>("identity.user_not_found", "Kullanıcı bulunamadı.");
        if (publicDemo.IsProtectedIdentity(account.Id)) return Protected<ConfirmMfaResult>();
        var rawCodes = security.GenerateRecoveryCodes();
        var version = account.Version;
        account.EnableMfa(security.ProtectSecret(payload.Secret), rawCodes.Select(security.HashRecoveryCode), clock.UtcNow);
        return await users.UpdateAsync(x => x.Id == account.Id, account, version, cancellationToken)
            ? Result.Success(new ConfirmMfaResult(rawCodes))
            : Result.Failure<ConfirmMfaResult>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi.");
    }

    public async Task<Result<bool>> DisableAsync(UserId userId, string code, CancellationToken cancellationToken)
    {
        var account = await users.SelectAsync(x => x.Id == userId, cancellationToken);
        if (account is null || !account.MfaEnabled || account.ProtectedMfaSecret is null)
            return Result.Failure<bool>("identity.mfa_not_enabled", "MFA etkin değil.");
        if (publicDemo.IsProtectedIdentity(account.Id)) return Protected<bool>();
        if (!security.ValidateProtectedSecret(account.ProtectedMfaSecret, code, clock.UtcNow))
            return Result.Failure<bool>("identity.mfa_code_invalid", "MFA kodu geçersiz.");
        var version = account.Version;
        account.DisableMfa(clock.UtcNow);
        return await users.UpdateAsync(x => x.Id == account.Id, account, version, cancellationToken)
            ? Result.Success(true)
            : Result.Failure<bool>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi.");
    }

    private static Result<T> Protected<T>() =>
        Result.Failure<T>("identity.demo_fixture_protected", "Sabit demo hesabı public demo modunda değiştirilemez.");
}
