using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Application.Sessions.Manage;

public sealed record SessionView(Guid Id, string DeviceId, string DeviceName, DateTimeOffset CreatedAtUtc, DateTimeOffset LastUsedAtUtc, DateTimeOffset ExpiresAtUtc, bool IsRevoked);

public sealed class ListSessionsHandler(IUserSessionRepository sessions)
{
    public async Task<IReadOnlyList<SessionView>> HandleAsync(UserId userId, CancellationToken cancellationToken)
    {
        var items = await sessions.ListByFilterAsync(x => x.UserId == userId, new(Limit: 100), cancellationToken);
        return items.Select(x => new SessionView(x.Id.Value, x.DeviceId, x.DeviceName, x.CreatedAtUtc, x.LastUsedAtUtc, x.ExpiresAtUtc, x.IsRevoked)).ToArray();
    }
}

public sealed class RevokeSessionHandler(IUserSessionRepository sessions, IClock clock)
{
    public async Task<Result<bool>> HandleAsync(UserId actorId, SessionId sessionId, CancellationToken cancellationToken)
    {
        var session = await sessions.SelectAsync(x => x.Id == sessionId, cancellationToken);
        if (session is null || session.UserId != actorId)
            return Result.Failure<bool>("identity.session_not_found", "Oturum bulunamadı.");
        var expectedVersion = session.Version;
        session.Revoke(clock.UtcNow, "user-revoked");
        return await sessions.UpdateAsync(x => x.Id == session.Id, session, expectedVersion, cancellationToken)
            ? Result.Success(true)
            : Result.Failure<bool>("identity.session_concurrency", "Oturum eşzamanlı değiştirildi.");
    }
}

public sealed class LogoutSessionHandler(IUserSessionRepository sessions, IRefreshTokenProtector protector, IClock clock)
{
    public async Task HandleAsync(string rawRefreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(rawRefreshToken)) return;
        var session = await sessions.FindByTokenHashAsync(protector.Hash(rawRefreshToken), cancellationToken);
        if (session is null) return;
        var expectedVersion = session.Version;
        session.Revoke(clock.UtcNow, "logout");
        await sessions.UpdateAsync(x => x.Id == session.Id, session, expectedVersion, cancellationToken);
    }
}
