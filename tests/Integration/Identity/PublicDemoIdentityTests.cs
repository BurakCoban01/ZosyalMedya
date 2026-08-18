using System.Linq.Expressions;
using Microsoft.Extensions.Options;
using Xunit;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Application.Privacy;
using ZosyalMedya.Modules.Identity.Application.Security;
using ZosyalMedya.Modules.Identity.Application.Users.Administration;
using ZosyalMedya.Modules.Identity.Application.Users.Login;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Configuration;
using ZosyalMedya.Modules.Identity.Infrastructure.Security;

namespace ZosyalMedya.Tests.Integration.Identity;

public sealed class PublicDemoIdentityTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 17, 12, 0, 0, TimeSpan.Zero);
    private static readonly UserId FixtureId = new(Guid.Parse("8c956dd6-2194-4d52-938a-dde1e5fd6264"));

    [Theory]
    [InlineData("guest@visitor.escp.test", true)]
    [InlineData("emre.karaca@demo.escp.test", false)]
    [InlineData("person@example.com", false)]
    [InlineData("@visitor.escp.test", false)]
    public void PolicyAllowsOnlyDisposableVisitorNamespace(string email, bool expected)
    {
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        Assert.Equal(expected, policy.IsVisitorEmail(email));
    }

    [Fact]
    public void PublicDemoProtectsEveryStableFixtureIdentity()
    {
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        string[] fixtureIds =
        [
            "8c956dd6-2194-4d52-938a-dde1e5fd6264",
            "11000000-0000-4000-8000-000000000001",
            "11000000-0000-4000-8000-000000000002",
            "11000000-0000-4000-8000-000000000003",
            "11000000-0000-4000-8000-000000000004",
            "11000000-0000-4000-8000-000000000005",
            "11000000-0000-4000-8000-000000000006",
            "11000000-0000-4000-8000-000000000007",
            "11000000-0000-4000-8000-000000000008"
        ];

        Assert.All(fixtureIds, id => Assert.True(policy.IsProtectedIdentity(
            new ZosyalMedya.Modules.Identity.Domain.Users.UserId(Guid.Parse(id)))));
        Assert.False(policy.IsProtectedIdentity(new(Guid.NewGuid())));
        Assert.False(new ConfiguredPublicDemoIdentityPolicy(false, "visitor.escp.test")
            .IsProtectedIdentity(new(Guid.Parse(fixtureIds[0]))));
    }

    [Fact]
    public async Task InvalidLoginCannotLockFixtureButStillRecordsVisitorFailure()
    {
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        var fixtureRepository = new UserRepository(Account(FixtureId));
        var fixtureHandler = Login(fixtureRepository, policy);

        var fixtureResult = await fixtureHandler.HandleAsync(
            new("emrekaraca", "wrong-password", "browser", "Browser"), default);

        Assert.Equal("identity.invalid_credentials", fixtureResult.Error.Code);
        Assert.Equal(0, fixtureRepository.UpdateCalls);

        var visitorRepository = new UserRepository(Account(UserId.New(), "visitor", "visitor@visitor.escp.test"));
        var visitorResult = await Login(visitorRepository, policy).HandleAsync(
            new("visitor", "wrong-password", "browser", "Browser"), default);

        Assert.Equal("identity.invalid_credentials", visitorResult.Error.Code);
        Assert.Equal(1, visitorRepository.UpdateCalls);

        var privateModeRepository = new UserRepository(Account(FixtureId));
        await Login(privateModeRepository, new ConfiguredPublicDemoIdentityPolicy(false, "visitor.escp.test"))
            .HandleAsync(new("emrekaraca", "wrong-password", "browser", "Browser"), default);
        Assert.Equal(1, privateModeRepository.UpdateCalls);
    }

    [Theory]
    [InlineData(SecurityChallengePurpose.VerifyEmail)]
    [InlineData(SecurityChallengePurpose.ResetPassword)]
    public async Task PreExistingSecurityChallengeCannotMutateFixture(SecurityChallengePurpose purpose)
    {
        var users = new UserRepository(Account(FixtureId));
        var challenge = SecurityChallenge.Issue(SecurityChallengeId.New(), FixtureId, purpose, "raw-token", Now,
            TimeSpan.FromHours(1));
        var challenges = new ChallengeRepository(challenge);
        var flows = new IdentitySecurityFlows(users, new SessionRepository(), challenges, new TokenProtector(),
            new PasswordHasher(), new MessageSender(), new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test"),
            new Clock());

        var result = purpose == SecurityChallengePurpose.VerifyEmail
            ? await flows.VerifyEmailAsync("raw-token", default)
            : await flows.ResetPasswordAsync("raw-token", "long-enough-password", default);

        Assert.Equal("identity.security_token_invalid", result.Error.Code);
        Assert.Equal(0, challenges.UpdateCalls);
        Assert.Equal(0, users.UpdateCalls);
        Assert.Null(challenge.ConsumedAtUtc);
    }

    [Fact]
    public async Task FixtureMfaErasureAndAdministrationRejectBeforeWrite()
    {
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        var users = new UserRepository(Account(FixtureId));
        var sessions = new SessionRepository();
        var challenges = new ChallengeRepository();
        var security = new MfaSecurity();
        var clock = new Clock();
        var audit = new Audit();

        var mfa = await new MfaFlows(users, security, policy, clock).BeginAsync(FixtureId, default);
        var erasure = await new DeleteMyIdentityDataHandler(users, sessions, challenges, new PasswordHasher(), security,
            policy, clock, audit).HandleAsync(FixtureId, "known-password", null, "test", default);
        var administration = await new ManageAccountsHandler(users, policy, clock, audit).ChangeAsync(FixtureId.Value,
            Guid.NewGuid(), AccountAdministrationChange.Suspend, null, "test", default);

        Assert.Equal("identity.demo_fixture_protected", mfa.Error.Code);
        Assert.Equal("identity.demo_fixture_protected", erasure.Error.Code);
        Assert.Equal("identity.demo_fixture_protected", administration.Error.Code);
        Assert.Equal(0, users.UpdateCalls);
        Assert.Equal(0, security.BeginCalls);
        Assert.Empty(audit.Records);
    }

    [Fact]
    public async Task MailboxKeepsOnlySyntheticActionsAndNeverWritesPickupFiles()
    {
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        var mailbox = new PublicDemoIdentityMailbox(policy, Options.Create(new IdentityDeliveryOptions
        {
            PublicWebBaseUrl = "https://demo.example.com",
            LocalPickupDirectory = "not-used"
        }), TimeProvider.System);

        await mailbox.SendEmailVerificationAsync("guest@visitor.escp.test", "verify-secret");
        await mailbox.SendPasswordResetAsync("guest@visitor.escp.test", "reset-secret");
        await mailbox.SendEmailVerificationAsync("other@visitor.escp.test", "other-secret");
        await mailbox.SendPasswordResetAsync("owner@demo.escp.test", "protected-secret");

        var capability = mailbox.Grant("guest@visitor.escp.test", null);
        var otherCapability = mailbox.Grant("other@visitor.escp.test", null);
        var messages = Assert.IsAssignableFrom<IReadOnlyList<PublicDemoMailboxMessage>>(
            mailbox.Read("guest@visitor.escp.test", capability));
        Assert.Contains(messages, message => message.Purpose == "EmailVerification" &&
            message.ActionUrl.Contains("/auth/verify-email?token=verify-secret", StringComparison.Ordinal));
        Assert.Contains(messages, message => message.Purpose == "PasswordReset" &&
            message.ActionUrl.Contains("/auth/reset-password?token=reset-secret", StringComparison.Ordinal));
        Assert.Null(mailbox.Read("owner@demo.escp.test", capability));
        Assert.Null(mailbox.Read("guest@visitor.escp.test", "wrong-capability"));
        Assert.Null(mailbox.Read("guest@visitor.escp.test", otherCapability));
    }

    [Fact]
    public async Task MailboxRemovesExpiredSyntheticActions()
    {
        var time = new AdjustableTimeProvider(new DateTimeOffset(2026, 8, 17, 12, 0, 0, TimeSpan.Zero));
        var policy = new ConfiguredPublicDemoIdentityPolicy(true, "visitor.escp.test");
        var mailbox = new PublicDemoIdentityMailbox(policy, Options.Create(new IdentityDeliveryOptions
        {
            PublicWebBaseUrl = "https://demo.example.com",
            LocalPickupDirectory = "not-used"
        }), time);

        await mailbox.SendPasswordResetAsync("guest@visitor.escp.test", "reset-secret");
        var capability = mailbox.Grant("guest@visitor.escp.test", null);
        Assert.Single(mailbox.Read("guest@visitor.escp.test", capability)!);

        time.Advance(TimeSpan.FromMinutes(31));

        Assert.Empty(mailbox.Read("guest@visitor.escp.test", capability)!);
    }

    private sealed class AdjustableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
        public void Advance(TimeSpan duration) => utcNow = utcNow.Add(duration);
    }

    private static UserAccount Account(UserId id, string username = "emrekaraca", string email = "emre@demo.escp.test") =>
        UserAccount.Register(id, username, email, "known-password", Now);

    private static LoginUserHandler Login(UserRepository users, IPublicDemoIdentityPolicy policy) =>
        new(users, new SessionRepository(), new PasswordHasher(false), new TokenIssuer(), new RefreshProtector(),
            new MfaSecurity(), policy, new Clock());

    private sealed class UserRepository(UserAccount account) : IUserAccountRepository
    {
        public int UpdateCalls { get; private set; }
        public Task<IReadOnlyList<UserAccount>> ListVisitorPageAsync(string emailDomain, UserId? afterId, int limit,
            CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<UserAccount>>([]);
        public Task<UserAccount?> SelectAsync(Expression<Func<UserAccount, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult<UserAccount?>(predicate.Compile()(account) ? account : null);
        public Task<IReadOnlyList<UserAccount>> ListByFilterAsync(Expression<Func<UserAccount, bool>> predicate,
            QueryOptions<UserAccount>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<UserAccount>>(predicate.Compile()(account) ? [account] : []);
        public Task<UserId> CreateAsync(UserAccount entity, CancellationToken cancellationToken = default) => Task.FromResult(entity.Id);
        public Task<bool> UpdateAsync(Expression<Func<UserAccount, bool>> predicate, UserAccount replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) { UpdateCalls++; return Task.FromResult(true); }
        public Task<long> DeleteByFilterAsync(Expression<Func<UserAccount, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult(0L);
    }

    private sealed class SessionRepository : IUserSessionRepository
    {
        public Task<UserSession?> FindByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default) => Task.FromResult<UserSession?>(null);
        public Task<UserSession?> SelectAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult<UserSession?>(null);
        public Task<IReadOnlyList<UserSession>> ListByFilterAsync(Expression<Func<UserSession, bool>> predicate,
            QueryOptions<UserSession>? options = null, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<UserSession>>([]);
        public Task<SessionId> CreateAsync(UserSession entity, CancellationToken cancellationToken = default) => Task.FromResult(entity.Id);
        public Task<bool> UpdateAsync(Expression<Func<UserSession, bool>> predicate, UserSession replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<long> DeleteByFilterAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult(0L);
    }

    private sealed class ChallengeRepository(params SecurityChallenge[] values) : ISecurityChallengeRepository
    {
        public int UpdateCalls { get; private set; }
        public Task<SecurityChallenge?> FindByTokenHashAsync(string tokenHash, SecurityChallengePurpose purpose,
            CancellationToken cancellationToken = default) => Task.FromResult(values.SingleOrDefault(x => x.TokenHash == tokenHash && x.Purpose == purpose));
        public Task<SecurityChallenge?> SelectAsync(Expression<Func<SecurityChallenge, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult(values.SingleOrDefault(predicate.Compile()));
        public Task<IReadOnlyList<SecurityChallenge>> ListByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate,
            QueryOptions<SecurityChallenge>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<SecurityChallenge>>(values.Where(predicate.Compile()).ToArray());
        public Task<SecurityChallengeId> CreateAsync(SecurityChallenge entity, CancellationToken cancellationToken = default) => Task.FromResult(entity.Id);
        public Task<bool> UpdateAsync(Expression<Func<SecurityChallenge, bool>> predicate, SecurityChallenge replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) { UpdateCalls++; return Task.FromResult(true); }
        public Task<long> DeleteByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult(0L);
    }

    private sealed class PasswordHasher(bool valid = true) : IPasswordHasher
    {
        public string Hash(string password) => "hashed:" + password;
        public bool Verify(string hash, string password) => valid;
    }

    private sealed class TokenProtector : ISecurityTokenProtector
    {
        public string Generate() => "raw-token";
        public string Hash(string rawToken) => rawToken;
    }

    private sealed class RefreshProtector : IRefreshTokenProtector
    {
        public string Generate() => "refresh";
        public string Hash(string rawToken) => rawToken;
    }

    private sealed class TokenIssuer : ITokenIssuer
    {
        public AccessToken IssueAccessToken(UserAccount account) => new("access", Now.AddMinutes(5));
    }

    private sealed class MessageSender : IIdentityMessageSender
    {
        public Task SendEmailVerificationAsync(string email, string rawToken, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SendPasswordResetAsync(string email, string rawToken, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class MfaSecurity : IMfaSecurityService
    {
        public int BeginCalls { get; private set; }
        public PendingMfaEnrollment Begin(UserAccount account, DateTimeOffset now) { BeginCalls++; return new("secret", "uri", "token"); }
        public bool TryReadEnrollment(string enrollmentToken, out MfaEnrollmentPayload payload) { payload = new(FixtureId, "secret", Now.AddMinutes(5)); return true; }
        public bool ValidateSecret(string secret, string code, DateTimeOffset now) => true;
        public bool ValidateProtectedSecret(string protectedSecret, string code, DateTimeOffset now) => true;
        public string ProtectSecret(string secret) => secret;
        public IReadOnlyList<string> GenerateRecoveryCodes() => ["1", "2", "3", "4", "5"];
        public string HashRecoveryCode(string code) => code;
    }

    private sealed class Clock : IClock { public DateTimeOffset UtcNow => Now; }
    private sealed class Audit : IAuditModule
    {
        public List<AuditRecord> Records { get; } = [];
        public Task WriteAsync(AuditRecord record, CancellationToken cancellationToken = default) { Records.Add(record); return Task.CompletedTask; }
    }
}
