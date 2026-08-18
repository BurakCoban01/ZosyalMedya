using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Security;

namespace ZosyalMedya.Modules.Identity.Application.Ports;

public interface IUserAccountRepository : IRepository<UserAccount, UserId>
{
    Task<IReadOnlyList<UserAccount>> ListVisitorPageAsync(string emailDomain, UserId? afterId, int limit,
        CancellationToken cancellationToken = default);
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string hash, string password);
}

public interface IUserSessionRepository : IRepository<UserSession, SessionId>
{
    Task<UserSession?> FindByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default);
}

public interface ISecurityChallengeRepository : IRepository<SecurityChallenge, SecurityChallengeId>
{
    Task<SecurityChallenge?> FindByTokenHashAsync(string tokenHash, SecurityChallengePurpose purpose,
        CancellationToken cancellationToken = default);
}

public interface ISecurityTokenProtector
{
    string Generate();
    string Hash(string rawToken);
}

public interface IIdentityMessageSender
{
    Task SendEmailVerificationAsync(string email, string rawToken, CancellationToken cancellationToken = default);
    Task SendPasswordResetAsync(string email, string rawToken, CancellationToken cancellationToken = default);
}

public interface IPublicDemoIdentityPolicy
{
    bool Enabled { get; }
    string VisitorEmailDomain { get; }
    bool IsVisitorEmail(string email);
    bool IsProtectedIdentity(UserId userId);
}

public sealed record PendingMfaEnrollment(string Secret, string AuthenticatorUri, string EnrollmentToken);
public sealed record MfaEnrollmentPayload(UserId UserId, string Secret, DateTimeOffset ExpiresAtUtc);

public interface IMfaSecurityService
{
    PendingMfaEnrollment Begin(UserAccount account, DateTimeOffset now);
    bool TryReadEnrollment(string enrollmentToken, out MfaEnrollmentPayload payload);
    bool ValidateSecret(string secret, string code, DateTimeOffset now);
    bool ValidateProtectedSecret(string protectedSecret, string code, DateTimeOffset now);
    string ProtectSecret(string secret);
    IReadOnlyList<string> GenerateRecoveryCodes();
    string HashRecoveryCode(string code);
}

public sealed record AccessToken(string Value, DateTimeOffset ExpiresAtUtc);
public sealed record TokenPair(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAtUtc);

public interface ITokenIssuer
{
    AccessToken IssueAccessToken(UserAccount account);
}

public interface IRefreshTokenProtector
{
    string Generate();
    string Hash(string rawToken);
}
