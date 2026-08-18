using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Identity.Domain.Users;

public readonly record struct UserId(Guid Value)
{
    public static UserId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public enum AccountStatus { PendingVerification, Active, Suspended, Deactivated }
public enum AccountRole { Member, Moderator, Support, Administrator }

public sealed record UserRegistered(UserId UserId, DateTimeOffset OccurredAtUtc) : IDomainEvent;
public sealed record UserPersonalDataErased(UserId UserId, DateTimeOffset OccurredAtUtc) : IDomainEvent;

public sealed class UserAccount : AggregateRoot<UserId>
{
    private UserAccount() : base(default)
    {
        Username = string.Empty;
        NormalizedUsername = string.Empty;
        Email = string.Empty;
        NormalizedEmail = string.Empty;
        PasswordHash = string.Empty;
        Roles = [AccountRole.Member];
        MfaRecoveryCodeHashes = [];
    }

    private UserAccount(
        UserId id,
        string username,
        string normalizedUsername,
        string email,
        string normalizedEmail,
        string passwordHash,
        DateTimeOffset createdAtUtc) : base(id)
    {
        Username = username;
        NormalizedUsername = normalizedUsername;
        Email = email;
        NormalizedEmail = normalizedEmail;
        PasswordHash = passwordHash;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
        Status = AccountStatus.PendingVerification;
        Roles = [AccountRole.Member];
        MfaRecoveryCodeHashes = [];
        Version = 1;
    }

    public string Username { get; private set; }
    public string NormalizedUsername { get; private set; }
    public string Email { get; private set; }
    public string NormalizedEmail { get; private set; }
    public string PasswordHash { get; private set; }
    public AccountStatus Status { get; private set; }
    public AccountRole[] Roles { get; private set; }
    public int FailedLoginCount { get; private set; }
    public DateTimeOffset? LockedUntilUtc { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public bool MfaEnabled { get; private set; }
    public string? ProtectedMfaSecret { get; private set; }
    public string[] MfaRecoveryCodeHashes { get; private set; }

    public static UserAccount Register(
        UserId id,
        string username,
        string email,
        string passwordHash,
        DateTimeOffset now)
    {
        var cleanUsername = username.Trim();
        var cleanEmail = email.Trim();
        if (cleanUsername.Length is < 3 or > 32)
            throw new DomainRuleException("identity.username_length", "Kullanıcı adı 3-32 karakter olmalıdır.");
        if (!cleanEmail.Contains('@', StringComparison.Ordinal) || cleanEmail.Length > 254)
            throw new DomainRuleException("identity.email_invalid", "Geçerli bir e-posta adresi gereklidir.");
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainRuleException("identity.password_hash_missing", "Parola özeti gereklidir.");

        var account = new UserAccount(
            id,
            cleanUsername,
            cleanUsername.ToUpperInvariant(),
            cleanEmail,
            cleanEmail.ToUpperInvariant(),
            passwordHash,
            now);
        account.Raise(new UserRegistered(id, now));
        return account;
    }

    public static UserAccount Rehydrate(
        UserId id, string username, string normalizedUsername, string email, string normalizedEmail,
        string passwordHash, AccountStatus status, int failedLoginCount, DateTimeOffset? lockedUntilUtc,
        DateTimeOffset createdAtUtc, DateTimeOffset updatedAtUtc, long version)
    {
        var account = new UserAccount(id, username, normalizedUsername, email, normalizedEmail, passwordHash, createdAtUtc)
        {
            Status = status,
            FailedLoginCount = failedLoginCount,
            LockedUntilUtc = lockedUntilUtc,
            UpdatedAtUtc = updatedAtUtc,
            Version = version
        };
        account.ClearDomainEvents();
        return account;
    }

    public bool IsLocked(DateTimeOffset now) => LockedUntilUtc is { } until && until > now;

    public void RecordFailedLogin(DateTimeOffset now, int threshold = 5, TimeSpan? lockDuration = null)
    {
        FailedLoginCount++;
        if (FailedLoginCount >= threshold)
        {
            LockedUntilUtc = now.Add(lockDuration ?? TimeSpan.FromMinutes(15));
            FailedLoginCount = 0;
        }
        Touch(now);
    }

    public void RecordSuccessfulLogin(DateTimeOffset now)
    {
        FailedLoginCount = 0;
        LockedUntilUtc = null;
        Touch(now);
    }

    public bool HasRole(AccountRole role) => Roles.Contains(role);

    public void SetRole(AccountRole role, bool enabled, DateTimeOffset now)
    {
        if (role == AccountRole.Member && !enabled)
            throw new DomainRuleException("identity.member_role_required", "Temel üye rolü kaldırılamaz.");
        var roles = Roles.ToHashSet();
        if (enabled) roles.Add(role); else roles.Remove(role);
        Roles = roles.OrderBy(x => x).ToArray();
        Touch(now);
    }

    public void VerifyEmail(DateTimeOffset now)
    {
        if (Status != AccountStatus.PendingVerification) return;
        Status = AccountStatus.Active;
        Touch(now);
    }

    public void ChangePassword(string passwordHash, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainRuleException("identity.password_hash_missing", "Parola özeti gereklidir.");
        PasswordHash = passwordHash;
        Touch(now);
    }

    public void EnableMfa(string protectedSecret, IEnumerable<string> recoveryCodeHashes, DateTimeOffset now)
    {
        var hashes = recoveryCodeHashes.Distinct(StringComparer.Ordinal).ToArray();
        if (string.IsNullOrWhiteSpace(protectedSecret) || hashes.Length < 5)
            throw new DomainRuleException("identity.mfa_setup_invalid", "MFA kurulumu geçersiz.");
        ProtectedMfaSecret = protectedSecret;
        MfaRecoveryCodeHashes = hashes;
        MfaEnabled = true;
        Touch(now);
    }

    public bool ConsumeRecoveryCode(string codeHash, DateTimeOffset now)
    {
        var index = Array.FindIndex(MfaRecoveryCodeHashes, value =>
            string.Equals(value, codeHash, StringComparison.Ordinal));
        if (index < 0) return false;
        MfaRecoveryCodeHashes = MfaRecoveryCodeHashes.Where((_, itemIndex) => itemIndex != index).ToArray();
        Touch(now);
        return true;
    }

    public void DisableMfa(DateTimeOffset now)
    {
        MfaEnabled = false;
        ProtectedMfaSecret = null;
        MfaRecoveryCodeHashes = [];
        Touch(now);
    }

    public void Suspend(DateTimeOffset now)
    {
        if (Status == AccountStatus.Deactivated)
            throw new DomainRuleException("identity.status_invalid", "Devre dışı hesap askıya alınamaz.");
        Status = AccountStatus.Suspended;
        Touch(now);
    }

    public void Reactivate(DateTimeOffset now)
    {
        if (Status is not (AccountStatus.Suspended or AccountStatus.Deactivated))
            throw new DomainRuleException("identity.status_invalid", "Hesap yeniden etkinleştirilebilir durumda değil.");
        Status = AccountStatus.Active;
        Touch(now);
    }

    public void Deactivate(DateTimeOffset now)
    {
        Status = AccountStatus.Deactivated;
        Touch(now);
    }

    /// <summary>
    /// Kimlik modülünün sahip olduğu doğrudan tanımlayıcıları geri döndürülemez biçimde takma adla değiştirir.
    /// Kullanıcı kimliği, diğer modüllerdeki yasal saklama ve içerik bütünlüğü kararlarının uygulanabilmesi için korunur.
    /// </summary>
    public void ErasePersonalData(DateTimeOffset now)
    {
        var suffix = Id.Value.ToString("N", System.Globalization.CultureInfo.InvariantCulture)[..23];
        Username = $"silinmis-{suffix}";
        NormalizedUsername = Username.ToUpperInvariant();
        Email = $"{Id.Value:N}@erased.invalid";
        NormalizedEmail = Email.ToUpperInvariant();
        PasswordHash = "ERASED";
        FailedLoginCount = 0;
        LockedUntilUtc = null;
        MfaEnabled = false;
        ProtectedMfaSecret = null;
        MfaRecoveryCodeHashes = [];
        Roles = [AccountRole.Member];
        Status = AccountStatus.Deactivated;
        Touch(now);
        Raise(new UserPersonalDataErased(Id, now));
    }

    private void Touch(DateTimeOffset now)
    {
        UpdatedAtUtc = now;
        Version++;
    }
}
