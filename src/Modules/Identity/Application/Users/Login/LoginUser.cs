using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Application.Users.Login;

public sealed record LoginUserCommand(string Login, string Password, string DeviceId, string DeviceName, string? MfaCode = null);
public sealed record LoginUserResult(Guid UserId, string Username, TokenPair Tokens);

public sealed class LoginUserHandler(
    IUserAccountRepository repository,
    IUserSessionRepository sessions,
    IPasswordHasher passwordHasher,
    ITokenIssuer tokenIssuer,
    IRefreshTokenProtector refreshTokenProtector,
    IMfaSecurityService mfaSecurity,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock)
{
    public async Task<Result<LoginUserResult>> HandleAsync(LoginUserCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.DeviceId) || command.DeviceId.Length > 128)
            return Result.Failure<LoginUserResult>("identity.device_id_invalid", "Geçerli bir cihaz kimliği gereklidir.");

        var normalized = command.Login.Trim().ToUpperInvariant();
        var account = await repository.SelectAsync(
            x => x.NormalizedUsername == normalized || x.NormalizedEmail == normalized,
            cancellationToken);
        if (account is null || !passwordHasher.Verify(account.PasswordHash, command.Password))
        {
            if (account is not null && !publicDemo.IsProtectedIdentity(account.Id))
            {
                var version = account.Version;
                account.RecordFailedLogin(clock.UtcNow);
                await repository.UpdateAsync(x => x.Id == account.Id, account, version, cancellationToken);
            }
            return Result.Failure<LoginUserResult>("identity.invalid_credentials", "Kimlik bilgileri geçersiz.");
        }

        if (account.IsLocked(clock.UtcNow))
            return Result.Failure<LoginUserResult>("identity.account_locked", "Hesap geçici olarak kilitli.");
        if (account.Status == AccountStatus.PendingVerification)
            return Result.Failure<LoginUserResult>("identity.email_not_verified", "Oturum açmadan önce e-posta adresinizi doğrulayın.");
        if (account.Status is AccountStatus.Suspended or AccountStatus.Deactivated)
            return Result.Failure<LoginUserResult>("identity.account_unavailable", "Hesap oturum açmaya kapalıdır.");

        var expectedVersion = account.Version;
        if (account.MfaEnabled)
        {
            var code = command.MfaCode?.Trim() ?? string.Empty;
            var validTotp = account.ProtectedMfaSecret is not null &&
                mfaSecurity.ValidateProtectedSecret(account.ProtectedMfaSecret, code, clock.UtcNow);
            var validRecovery = !validTotp && !publicDemo.IsProtectedIdentity(account.Id) &&
                account.ConsumeRecoveryCode(mfaSecurity.HashRecoveryCode(code), clock.UtcNow);
            if (!validTotp && !validRecovery)
            {
                if (!publicDemo.IsProtectedIdentity(account.Id))
                {
                    account.RecordFailedLogin(clock.UtcNow);
                    await repository.UpdateAsync(x => x.Id == account.Id, account, expectedVersion, cancellationToken);
                }
                return Result.Failure<LoginUserResult>("identity.mfa_code_invalid", "MFA veya kurtarma kodu geçersiz.");
            }
        }
        account.RecordSuccessfulLogin(clock.UtcNow);
        if (!await repository.UpdateAsync(x => x.Id == account.Id, account, expectedVersion, cancellationToken))
            return Result.Failure<LoginUserResult>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi; tekrar deneyin.");

        var existingSessions = await sessions.ListByFilterAsync(
            x => x.UserId == account.Id && x.DeviceId == command.DeviceId && x.RevokedAtUtc == null,
            new(Limit: 10), cancellationToken);
        foreach (var existing in existingSessions)
        {
            var existingVersion = existing.Version;
            existing.Revoke(clock.UtcNow, "device-relogin");
            await sessions.UpdateAsync(x => x.Id == existing.Id, existing, existingVersion, cancellationToken);
        }

        var rawRefreshToken = refreshTokenProtector.Generate();
        var session = UserSession.Start(
            SessionId.New(),
            account.Id,
            command.DeviceId,
            command.DeviceName,
            refreshTokenProtector.Hash(rawRefreshToken),
            clock.UtcNow,
            clock.UtcNow.AddDays(30));
        await sessions.CreateAsync(session, cancellationToken);
        var access = tokenIssuer.IssueAccessToken(account);
        var tokens = new TokenPair(access.Value, rawRefreshToken, access.ExpiresAtUtc);
        return Result.Success(new LoginUserResult(account.Id.Value, account.Username, tokens));
    }
}
