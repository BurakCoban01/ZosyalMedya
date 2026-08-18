using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Domain.Sessions;

namespace ZosyalMedya.Modules.Identity.Application.Privacy;

public sealed record IdentityDataExport(
    Guid UserId,
    string Username,
    string Email,
    string Status,
    IReadOnlyList<string> Roles,
    bool MfaEnabled,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    IReadOnlyList<ExportedSession> Sessions,
    DateTimeOffset ExportedAtUtc);

public sealed record ExportedSession(Guid Id, string DeviceId, string DeviceName,
    DateTimeOffset CreatedAtUtc, DateTimeOffset LastUsedAtUtc, DateTimeOffset ExpiresAtUtc,
    DateTimeOffset? RevokedAtUtc);

public sealed class ExportMyIdentityDataHandler(
    IUserAccountRepository users,
    IUserSessionRepository sessions,
    IClock clock,
    IAuditModule audit)
{
    public async Task<Result<IdentityDataExport>> HandleAsync(
        UserId actorId, string correlationId, CancellationToken cancellationToken)
    {
        var account = await users.SelectAsync(x => x.Id == actorId, cancellationToken);
        if (account is null)
            return Result.Failure<IdentityDataExport>("identity.user_not_found", "Kullanıcı bulunamadı.");

        var activeSessions = await sessions.ListByFilterAsync(x => x.UserId == actorId,
            new QueryOptions<UserSession>(100,
                [new(x => x.CreatedAtUtc, SortDirection.Descending)]), cancellationToken);
        var export = new IdentityDataExport(account.Id.Value, account.Username, account.Email,
            account.Status.ToString(), account.Roles.Select(x => x.ToString()).ToArray(), account.MfaEnabled,
            account.CreatedAtUtc, account.UpdatedAtUtc,
            activeSessions.Select(x => new ExportedSession(x.Id.Value, x.DeviceId, x.DeviceName,
                x.CreatedAtUtc, x.LastUsedAtUtc, x.ExpiresAtUtc, x.RevokedAtUtc)).ToArray(), clock.UtcNow);

        await audit.WriteAsync(new(actorId.Value, "identity.privacy.exported", "UserAccount", actorId.ToString(),
            AuditSeverity.Warning, new Dictionary<string, string> { ["scope"] = "identity-and-sessions" },
            correlationId), cancellationToken);
        return Result.Success(export);
    }
}

public sealed class DeleteMyIdentityDataHandler(
    IUserAccountRepository users,
    IUserSessionRepository sessions,
    ISecurityChallengeRepository challenges,
    IPasswordHasher passwordHasher,
    IMfaSecurityService mfa,
    IPublicDemoIdentityPolicy publicDemo,
    IClock clock,
    IAuditModule audit)
{
    public async Task<Result<bool>> HandleAsync(UserId actorId, string currentPassword, string? mfaCode,
        string correlationId, CancellationToken cancellationToken)
    {
        var account = await users.SelectAsync(x => x.Id == actorId, cancellationToken);
        if (account is null)
            return Result.Failure<bool>("identity.user_not_found", "Kullanıcı bulunamadı.");
        if (publicDemo.IsProtectedIdentity(account.Id))
            return Result.Failure<bool>("identity.demo_fixture_protected", "Sabit demo hesabı public demo modunda değiştirilemez.");
        if (!passwordHasher.Verify(account.PasswordHash, currentPassword))
            return Result.Failure<bool>("identity.credentials_invalid", "Kimlik bilgileri doğrulanamadı.");
        if (account.MfaEnabled && (string.IsNullOrWhiteSpace(mfaCode) || account.ProtectedMfaSecret is null ||
            !mfa.ValidateProtectedSecret(account.ProtectedMfaSecret, mfaCode, clock.UtcNow)))
            return Result.Failure<bool>("identity.mfa_required", "Geçerli bir MFA kodu gereklidir.");

        var version = account.Version;
        account.ErasePersonalData(clock.UtcNow);
        if (!await users.UpdateAsync(x => x.Id == actorId, account, version, cancellationToken))
            return Result.Failure<bool>("identity.concurrency_conflict", "Hesap eşzamanlı güncellendi.");

        // Oturum ve tek kullanımlık güvenlik kayıtları, yasal/audit değeri taşımayan geçici kimlik verileridir.
        await sessions.DeleteByFilterAsync(x => x.UserId == actorId, cancellationToken);
        await challenges.DeleteByFilterAsync(x => x.UserId == actorId, cancellationToken);
        await audit.WriteAsync(new(actorId.Value, "identity.privacy.erased", "UserAccount", actorId.ToString(),
            AuditSeverity.Critical, new Dictionary<string, string> { ["identityState"] = "anonymized" },
            correlationId), cancellationToken);
        return Result.Success(true);
    }
}
