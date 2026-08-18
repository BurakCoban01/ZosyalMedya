using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Domain.Security;

public readonly record struct SecurityChallengeId(Guid Value)
{
    public static SecurityChallengeId New() => new(Guid.NewGuid());
}

public enum SecurityChallengePurpose { VerifyEmail, ResetPassword }

public sealed class SecurityChallenge : AggregateRoot<SecurityChallengeId>
{
    private SecurityChallenge() : base(default) { TokenHash = string.Empty; }

    private SecurityChallenge(SecurityChallengeId id, UserId userId, SecurityChallengePurpose purpose,
        string tokenHash, DateTimeOffset createdAtUtc, DateTimeOffset expiresAtUtc) : base(id)
    {
        if (string.IsNullOrWhiteSpace(tokenHash))
            throw new DomainRuleException("identity.challenge_hash_missing", "Güvenlik belirteci özeti gereklidir.");
        if (expiresAtUtc <= createdAtUtc)
            throw new DomainRuleException("identity.challenge_expiry_invalid", "Güvenlik belirtecinin süresi gelecekte olmalıdır.");
        UserId = userId;
        Purpose = purpose;
        TokenHash = tokenHash;
        CreatedAtUtc = createdAtUtc;
        ExpiresAtUtc = expiresAtUtc;
        Version = 1;
    }

    public UserId UserId { get; private set; }
    public SecurityChallengePurpose Purpose { get; private set; }
    public string TokenHash { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset? ConsumedAtUtc { get; private set; }

    public static SecurityChallenge Issue(SecurityChallengeId id, UserId userId, SecurityChallengePurpose purpose,
        string tokenHash, DateTimeOffset now, TimeSpan lifetime) =>
        new(id, userId, purpose, tokenHash, now, now.Add(lifetime));

    public void Consume(DateTimeOffset now)
    {
        if (ConsumedAtUtc.HasValue)
            throw new DomainRuleException("identity.challenge_consumed", "Güvenlik belirteci daha önce kullanılmış.");
        if (ExpiresAtUtc <= now)
            throw new DomainRuleException("identity.challenge_expired", "Güvenlik belirtecinin süresi dolmuş.");
        ConsumedAtUtc = now;
        Version++;
    }
}
