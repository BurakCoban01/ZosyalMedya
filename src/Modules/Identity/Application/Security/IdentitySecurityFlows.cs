using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Application.Security;

public sealed class IdentitySecurityFlows(
    IUserAccountRepository users,
    IUserSessionRepository sessions,
    ISecurityChallengeRepository challenges,
    ISecurityTokenProtector tokenProtector,
    IPasswordHasher passwordHasher,
    IIdentityMessageSender messageSender,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock)
{
    public async Task<Result<bool>> SendVerificationAsync(string email, CancellationToken cancellationToken)
    {
        if (publicDemo.Enabled && !publicDemo.IsVisitorEmail(email)) return Result.Success(true);
        var normalized = email.Trim().ToUpperInvariant();
        var account = await users.SelectAsync(x => x.NormalizedEmail == normalized, cancellationToken);
        if (account is null || account.Status != AccountStatus.PendingVerification)
            return Result.Success(true); // Hesap varlığını açığa çıkarmaz.

        var rawToken = tokenProtector.Generate();
        var challenge = SecurityChallenge.Issue(SecurityChallengeId.New(), account.Id,
            SecurityChallengePurpose.VerifyEmail, tokenProtector.Hash(rawToken), clock.UtcNow, TimeSpan.FromHours(24));
        await challenges.CreateAsync(challenge, cancellationToken);
        await messageSender.SendEmailVerificationAsync(account.Email, rawToken, cancellationToken);
        return Result.Success(true);
    }

    public async Task<Result<bool>> VerifyEmailAsync(string rawToken, CancellationToken cancellationToken)
    {
        var challenge = await FindAsync(rawToken, SecurityChallengePurpose.VerifyEmail, cancellationToken);
        if (challenge is null) return InvalidToken();
        var account = await users.SelectAsync(x => x.Id == challenge.UserId, cancellationToken);
        if (account is null || publicDemo.IsProtectedIdentity(account.Id)) return InvalidToken();
        try { challenge.Consume(clock.UtcNow); }
        catch (DomainRuleException) { return InvalidToken(); }

        var challengeVersion = challenge.Version - 1;
        if (!await challenges.UpdateAsync(x => x.Id == challenge.Id, challenge, challengeVersion, cancellationToken))
            return InvalidToken();
        var accountVersion = account.Version;
        account.VerifyEmail(clock.UtcNow);
        return await users.UpdateAsync(x => x.Id == account.Id, account, accountVersion, cancellationToken)
            ? Result.Success(true)
            : Result.Failure<bool>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi; tekrar deneyin.");
    }

    public async Task<Result<bool>> RequestPasswordResetAsync(string email, CancellationToken cancellationToken)
    {
        if (publicDemo.Enabled && !publicDemo.IsVisitorEmail(email)) return Result.Success(true);
        var normalized = email.Trim().ToUpperInvariant();
        var account = await users.SelectAsync(x => x.NormalizedEmail == normalized, cancellationToken);
        if (account is null || account.Status is AccountStatus.Suspended or AccountStatus.Deactivated)
            return Result.Success(true);

        var rawToken = tokenProtector.Generate();
        var challenge = SecurityChallenge.Issue(SecurityChallengeId.New(), account.Id,
            SecurityChallengePurpose.ResetPassword, tokenProtector.Hash(rawToken), clock.UtcNow, TimeSpan.FromMinutes(30));
        await challenges.CreateAsync(challenge, cancellationToken);
        await messageSender.SendPasswordResetAsync(account.Email, rawToken, cancellationToken);
        return Result.Success(true);
    }

    public async Task<Result<bool>> ResetPasswordAsync(string rawToken, string newPassword, CancellationToken cancellationToken)
    {
        if (newPassword.Length < 12)
            return Result.Failure<bool>("identity.password_weak", "Parola en az 12 karakter olmalıdır.");
        var challenge = await FindAsync(rawToken, SecurityChallengePurpose.ResetPassword, cancellationToken);
        if (challenge is null) return InvalidToken();
        var account = await users.SelectAsync(x => x.Id == challenge.UserId, cancellationToken);
        if (account is null || account.Status is AccountStatus.Suspended or AccountStatus.Deactivated ||
            publicDemo.IsProtectedIdentity(account.Id)) return InvalidToken();
        try { challenge.Consume(clock.UtcNow); }
        catch (DomainRuleException) { return InvalidToken(); }

        var challengeVersion = challenge.Version - 1;
        if (!await challenges.UpdateAsync(x => x.Id == challenge.Id, challenge, challengeVersion, cancellationToken))
            return InvalidToken();
        var accountVersion = account.Version;
        account.ChangePassword(passwordHasher.Hash(newPassword), clock.UtcNow);
        if (!await users.UpdateAsync(x => x.Id == account.Id, account, accountVersion, cancellationToken))
            return Result.Failure<bool>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi; tekrar deneyin.");

        var activeSessions = await sessions.ListByFilterAsync(
            x => x.UserId == account.Id && x.RevokedAtUtc == null, new(Limit: 200), cancellationToken);
        foreach (var session in activeSessions)
        {
            var version = session.Version;
            session.Revoke(clock.UtcNow, "password-reset");
            await sessions.UpdateAsync(x => x.Id == session.Id, session, version, cancellationToken);
        }
        return Result.Success(true);
    }

    private async Task<SecurityChallenge?> FindAsync(string rawToken, SecurityChallengePurpose purpose,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken) || rawToken.Length > 512) return null;
        return await challenges.FindByTokenHashAsync(tokenProtector.Hash(rawToken), purpose, cancellationToken);
    }

    private static Result<bool> InvalidToken() =>
        Result.Failure<bool>("identity.security_token_invalid", "Güvenlik belirteci geçersiz veya süresi dolmuş.");
}
