using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;

namespace ZosyalMedya.Modules.Identity.Application.Sessions.Refresh;

public sealed record RefreshSessionCommand(string RefreshToken);

public sealed class RefreshSessionHandler(
    IUserSessionRepository sessions,
    IUserAccountRepository users,
    IRefreshTokenProtector tokenProtector,
    ITokenIssuer tokenIssuer,
    IClock clock)
{
    public async Task<Result<TokenPair>> HandleAsync(RefreshSessionCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.RefreshToken))
            return Result.Failure<TokenPair>("identity.refresh_invalid", "Refresh token geçersiz.");

        var presentedHash = tokenProtector.Hash(command.RefreshToken);
        var session = await sessions.FindByTokenHashAsync(presentedHash, cancellationToken);
        if (session is null)
            return Result.Failure<TokenPair>("identity.refresh_invalid", "Refresh token geçersiz.");

        var rawReplacement = tokenProtector.Generate();
        var expectedVersion = session.Version;
        var outcome = session.Rotate(
            presentedHash,
            tokenProtector.Hash(rawReplacement),
            clock.UtcNow,
            clock.UtcNow.AddDays(30));

        if (outcome != RefreshRotationOutcome.Rotated)
        {
            if (outcome is RefreshRotationOutcome.ReuseDetected or RefreshRotationOutcome.Expired or RefreshRotationOutcome.RotationLimitReached)
                await sessions.UpdateAsync(x => x.Id == session.Id, session, expectedVersion, cancellationToken);
            var code = outcome == RefreshRotationOutcome.ReuseDetected ? "identity.refresh_reuse_detected" : "identity.refresh_invalid";
            return Result.Failure<TokenPair>(code, "Oturum yenilenemedi; yeniden giriş yapın.");
        }

        if (!await sessions.UpdateAsync(x => x.Id == session.Id, session, expectedVersion, cancellationToken))
            return Result.Failure<TokenPair>("identity.session_concurrency", "Oturum eşzamanlı yenilendi; yeniden giriş yapın.");

        var account = await users.SelectAsync(x => x.Id == session.UserId, cancellationToken);
        if (account is null)
            return Result.Failure<TokenPair>("identity.account_unavailable", "Hesap kullanılamıyor.");
        var access = tokenIssuer.IssueAccessToken(account);
        return Result.Success(new TokenPair(access.Value, rawReplacement, access.ExpiresAtUtc));
    }
}
