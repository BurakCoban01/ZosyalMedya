using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Domain.Sessions;

public readonly record struct SessionId(Guid Value)
{
    public static SessionId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public enum RefreshRotationOutcome
{
    Rotated,
    InvalidToken,
    ReuseDetected,
    Expired,
    Revoked,
    RotationLimitReached
}

/// <summary>
/// Bir cihaz oturumunun refresh-token ailesini yönetir. Ham token hiçbir zaman aggregate'e girmez.
/// </summary>
public sealed class UserSession : AggregateRoot<SessionId>
{
    private const int MaximumRotations = 128;
    private string[] _consumedTokenHashes = [];

    private UserSession() : base(default)
    {
        DeviceId = string.Empty;
        DeviceName = string.Empty;
        RefreshTokenHash = string.Empty;
    }

    private UserSession(
        SessionId id,
        UserId userId,
        string deviceId,
        string deviceName,
        string refreshTokenHash,
        DateTimeOffset createdAtUtc,
        DateTimeOffset expiresAtUtc) : base(id)
    {
        UserId = userId;
        DeviceId = deviceId;
        DeviceName = deviceName;
        RefreshTokenHash = refreshTokenHash;
        CreatedAtUtc = createdAtUtc;
        LastUsedAtUtc = createdAtUtc;
        ExpiresAtUtc = expiresAtUtc;
        Version = 1;
    }

    public UserId UserId { get; private set; }
    public string DeviceId { get; private set; }
    public string DeviceName { get; private set; }
    public string RefreshTokenHash { get; private set; }
    public IReadOnlyCollection<string> ConsumedTokenHashes => Array.AsReadOnly(_consumedTokenHashes);
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset LastUsedAtUtc { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset? RevokedAtUtc { get; private set; }
    public string? RevocationReason { get; private set; }
    public bool IsRevoked => RevokedAtUtc.HasValue;

    public static UserSession Start(
        SessionId id,
        UserId userId,
        string deviceId,
        string deviceName,
        string refreshTokenHash,
        DateTimeOffset now,
        DateTimeOffset expiresAtUtc)
    {
        if (string.IsNullOrWhiteSpace(deviceId) || deviceId.Length > 128)
            throw new DomainRuleException("identity.device_id_invalid", "Geçerli bir cihaz kimliği gereklidir.");
        if (string.IsNullOrWhiteSpace(refreshTokenHash))
            throw new DomainRuleException("identity.refresh_hash_missing", "Refresh token özeti gereklidir.");
        if (expiresAtUtc <= now)
            throw new DomainRuleException("identity.session_expiry_invalid", "Oturum süresi gelecekte olmalıdır.");

        var safeName = string.IsNullOrWhiteSpace(deviceName) ? "Bilinmeyen cihaz" : deviceName.Trim();
        return new UserSession(id, userId, deviceId.Trim(), safeName[..Math.Min(safeName.Length, 120)], refreshTokenHash, now, expiresAtUtc);
    }

    public RefreshRotationOutcome Rotate(
        string presentedHash,
        string replacementHash,
        DateTimeOffset now,
        DateTimeOffset replacementExpiresAtUtc)
    {
        if (IsRevoked) return RefreshRotationOutcome.Revoked;
        if (ExpiresAtUtc <= now)
        {
            Revoke(now, "expired");
            return RefreshRotationOutcome.Expired;
        }
        if (_consumedTokenHashes.Contains(presentedHash, StringComparer.Ordinal))
        {
            Revoke(now, "refresh-token-reuse");
            return RefreshRotationOutcome.ReuseDetected;
        }
        if (!string.Equals(RefreshTokenHash, presentedHash, StringComparison.Ordinal))
            return RefreshRotationOutcome.InvalidToken;
        if (_consumedTokenHashes.Length >= MaximumRotations)
        {
            Revoke(now, "rotation-limit");
            return RefreshRotationOutcome.RotationLimitReached;
        }

        _consumedTokenHashes = [.. _consumedTokenHashes, RefreshTokenHash];
        RefreshTokenHash = replacementHash;
        LastUsedAtUtc = now;
        ExpiresAtUtc = replacementExpiresAtUtc;
        Version++;
        return RefreshRotationOutcome.Rotated;
    }

    public void Revoke(DateTimeOffset now, string reason)
    {
        if (IsRevoked) return;
        RevokedAtUtc = now;
        RevocationReason = string.IsNullOrWhiteSpace(reason) ? "revoked" : reason[..Math.Min(reason.Length, 120)];
        Version++;
    }
}
