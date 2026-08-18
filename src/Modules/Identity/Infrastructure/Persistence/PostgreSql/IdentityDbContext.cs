using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<UserSession> Sessions => Set<UserSession>();
    public DbSet<SecurityChallenge> SecurityChallenges => Set<SecurityChallenge>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("identity");
        modelBuilder.AddTransactionalOutbox();
        var idConverter = new ValueConverter<UserId, Guid>(id => id.Value, value => new UserId(value));
        var user = modelBuilder.Entity<UserAccount>();
        user.ToTable("users");
        user.HasKey(x => x.Id);
        user.Property(x => x.Id).HasConversion(idConverter).ValueGeneratedNever();
        user.Property(x => x.Username).HasMaxLength(32).IsRequired();
        user.Property(x => x.NormalizedUsername).HasMaxLength(32).IsRequired();
        user.Property(x => x.Email).HasMaxLength(254).IsRequired();
        user.Property(x => x.NormalizedEmail).HasMaxLength(254).IsRequired();
        user.Property(x => x.PasswordHash).HasMaxLength(512).IsRequired();
        user.Property(x => x.ProtectedMfaSecret).HasMaxLength(2048);
        var recoveryHashes = user.Property(x => x.MfaRecoveryCodeHashes).HasColumnType("text[]").Metadata;
        recoveryHashes.SetValueComparer(new ValueComparer<string[]>(
            (left, right) => left != null && right != null && left.SequenceEqual(right),
            value => value.Aggregate(0, (hash, item) => HashCode.Combine(hash, item.GetHashCode(StringComparison.Ordinal))),
            value => value.ToArray()));
        user.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        var roles = user.Property(x => x.Roles)
            .HasConversion(value => value.Select(role => role.ToString()).ToArray(),
                value => value.Select(role => Enum.Parse<AccountRole>(role)).ToArray())
            .HasColumnType("text[]").Metadata;
        roles.SetValueComparer(new ValueComparer<AccountRole[]>(
            (left, right) => left != null && right != null && left.SequenceEqual(right),
            value => value.Aggregate(0, (hash, role) => HashCode.Combine(hash, role.GetHashCode())),
            value => value.ToArray()));
        user.Property(x => x.Version).IsConcurrencyToken();
        user.HasIndex(x => x.NormalizedUsername).IsUnique();
        user.HasIndex(x => x.NormalizedEmail).IsUnique();
        user.Ignore(x => x.DomainEvents);

        var sessionIdConverter = new ValueConverter<SessionId, Guid>(id => id.Value, value => new SessionId(value));
        var session = modelBuilder.Entity<UserSession>();
        session.ToTable("sessions");
        session.HasKey(x => x.Id);
        session.Property(x => x.Id).HasConversion(sessionIdConverter).ValueGeneratedNever();
        session.Property(x => x.UserId).HasConversion(idConverter).IsRequired();
        session.Property(x => x.DeviceId).HasMaxLength(128).IsRequired();
        session.Property(x => x.DeviceName).HasMaxLength(120).IsRequired();
        session.Property(x => x.RefreshTokenHash).HasMaxLength(64).IsRequired();
        session.Property(x => x.RevocationReason).HasMaxLength(120);
        session.Property(x => x.Version).IsConcurrencyToken();
        var hashes = session.Property<string[]>("_consumedTokenHashes")
            .HasColumnName("ConsumedTokenHashes")
            .HasColumnType("text[]")
            .Metadata;
        hashes.SetValueComparer(new ValueComparer<string[]>(
            (left, right) => left != null && right != null && left.SequenceEqual(right),
            value => value.Aggregate(0, (hash, item) => HashCode.Combine(hash, item.GetHashCode(StringComparison.Ordinal))),
            value => value.ToArray()));
        session.HasIndex(x => x.RefreshTokenHash).IsUnique();
        session.HasIndex(x => new { x.UserId, x.DeviceId });
        session.Ignore(x => x.ConsumedTokenHashes);
        session.Ignore(x => x.IsRevoked);
        session.Ignore(x => x.DomainEvents);

        var challengeIdConverter = new ValueConverter<SecurityChallengeId, Guid>(id => id.Value, value => new SecurityChallengeId(value));
        var challenge = modelBuilder.Entity<SecurityChallenge>();
        challenge.ToTable("security_challenges");
        challenge.HasKey(x => x.Id);
        challenge.Property(x => x.Id).HasConversion(challengeIdConverter).ValueGeneratedNever();
        challenge.Property(x => x.UserId).HasConversion(idConverter).IsRequired();
        challenge.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(32);
        challenge.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        challenge.Property(x => x.Version).IsConcurrencyToken();
        challenge.HasIndex(x => new { x.TokenHash, x.Purpose }).IsUnique();
        challenge.HasIndex(x => new { x.UserId, x.Purpose, x.ExpiresAtUtc });
        challenge.Ignore(x => x.DomainEvents);
    }
}
