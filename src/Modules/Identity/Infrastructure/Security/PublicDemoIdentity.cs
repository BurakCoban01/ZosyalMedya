using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.Extensions.Hosting;
using ZosyalMedya.Modules.Identity.Application.Ports;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Security;

public sealed class ConfiguredPublicDemoIdentityPolicy(bool enabled, string visitorEmailDomain) : IPublicDemoIdentityPolicy
{
    private static readonly HashSet<Guid> ProtectedIdentityIds =
    [
        Guid.Parse("8c956dd6-2194-4d52-938a-dde1e5fd6264"),
        Guid.Parse("11000000-0000-4000-8000-000000000001"),
        Guid.Parse("11000000-0000-4000-8000-000000000002"),
        Guid.Parse("11000000-0000-4000-8000-000000000003"),
        Guid.Parse("11000000-0000-4000-8000-000000000004"),
        Guid.Parse("11000000-0000-4000-8000-000000000005"),
        Guid.Parse("11000000-0000-4000-8000-000000000006"),
        Guid.Parse("11000000-0000-4000-8000-000000000007"),
        Guid.Parse("11000000-0000-4000-8000-000000000008")
    ];

    public string VisitorEmailDomain { get; } = visitorEmailDomain.Trim().TrimStart('@').ToLowerInvariant();
    private string Suffix => "@" + VisitorEmailDomain;
    public bool Enabled { get; } = enabled;
    public bool IsVisitorEmail(string email) => Enabled && email.Trim().ToLowerInvariant().EndsWith(Suffix, StringComparison.Ordinal)
        && email.Trim().Length > Suffix.Length;
    public bool IsProtectedIdentity(Domain.Users.UserId userId) => Enabled && ProtectedIdentityIds.Contains(userId.Value);
}

public sealed record PublicDemoMailboxMessage(string Purpose, string ActionUrl, DateTimeOffset ExpiresAtUtc);

public sealed class PublicDemoIdentityMailbox(
    ConfiguredPublicDemoIdentityPolicy policy,
    Microsoft.Extensions.Options.IOptions<Configuration.IdentityDeliveryOptions> options,
    TimeProvider timeProvider) : BackgroundService, IIdentityMessageSender
{
    private const int MaximumMessages = 2_000;
    private const int MaximumGrants = 1_000;
    private readonly ConcurrentDictionary<string, PublicDemoMailboxMessage> messages = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, PublicDemoMailboxGrant> grants = new(StringComparer.Ordinal);

    public Task SendEmailVerificationAsync(string email, string rawToken, CancellationToken cancellationToken = default) =>
        Store(email, "EmailVerification", "/auth/verify-email?token=", rawToken, TimeSpan.FromHours(24));

    public Task SendPasswordResetAsync(string email, string rawToken, CancellationToken cancellationToken = default) =>
        Store(email, "PasswordReset", "/auth/reset-password?token=", rawToken, TimeSpan.FromMinutes(30));

    public string Grant(string email, string? currentCapability)
    {
        if (!policy.IsVisitorEmail(email)) throw new InvalidOperationException("Demo mailbox grants require a synthetic visitor identity.");
        PruneExpired();
        var normalizedEmail = email.Trim().ToLowerInvariant();
        if (currentCapability is not null && IsCapabilityFormat(currentCapability))
        {
            var currentHash = Hash(currentCapability);
            if (grants.TryGetValue(currentHash, out var current) && current.ExpiresAtUtc > timeProvider.GetUtcNow())
            {
                grants[currentHash] = current with { Emails = current.Emails.Append(normalizedEmail).ToHashSet(StringComparer.OrdinalIgnoreCase) };
                return currentCapability;
            }
        }

        var capability = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        grants[Hash(capability)] = new(new HashSet<string>([normalizedEmail], StringComparer.OrdinalIgnoreCase),
            timeProvider.GetUtcNow().AddHours(24));
        foreach (var overflow in grants.OrderBy(item => item.Value.ExpiresAtUtc).Take(Math.Max(0, grants.Count - MaximumGrants)).ToArray())
            grants.TryRemove(overflow.Key, out _);
        return capability;
    }

    public IReadOnlyList<PublicDemoMailboxMessage>? Read(string email, string capability)
    {
        if (!policy.IsVisitorEmail(email) || !IsCapabilityFormat(capability)) return null;
        PruneExpired();
        if (!grants.TryGetValue(Hash(capability), out var grant) ||
            !grant.Emails.Contains(email.Trim().ToLowerInvariant())) return null;
        var prefix = email.Trim() + "\n";
        return messages.Where(item => item.Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Value).OrderByDescending(item => item.ExpiresAtUtc).ToArray();
    }

    private Task Store(string email, string purpose, string path, string token, TimeSpan lifetime)
    {
        if (!policy.IsVisitorEmail(email)) return Task.CompletedTask;
        PruneExpired();
        var now = timeProvider.GetUtcNow();
        var url = options.Value.PublicWebBaseUrl.TrimEnd('/') + path + Uri.EscapeDataString(token);
        messages[email.Trim() + "\n" + purpose] = new(purpose, url, now.Add(lifetime));
        foreach (var overflow in messages.OrderBy(item => item.Value.ExpiresAtUtc).Take(Math.Max(0, messages.Count - MaximumMessages)).ToArray())
            messages.TryRemove(overflow.Key, out _);
        return Task.CompletedTask;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken)) PruneExpired();
    }

    private void PruneExpired()
    {
        var now = timeProvider.GetUtcNow();
        foreach (var stale in messages.Where(item => item.Value.ExpiresAtUtc <= now).Select(item => item.Key).ToArray())
            messages.TryRemove(stale, out _);
        foreach (var stale in grants.Where(item => item.Value.ExpiresAtUtc <= now).Select(item => item.Key).ToArray())
            grants.TryRemove(stale, out _);
    }

    private static string Hash(string capability) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(capability)));

    private static bool IsCapabilityFormat(string? capability) =>
        capability is { Length: 64 } && capability.All(Uri.IsHexDigit);

    private sealed record PublicDemoMailboxGrant(HashSet<string> Emails, DateTimeOffset ExpiresAtUtc);
}
