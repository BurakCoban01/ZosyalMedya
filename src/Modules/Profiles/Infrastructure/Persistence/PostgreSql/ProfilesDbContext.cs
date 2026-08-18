using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;

namespace ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.PostgreSql;

public sealed class ProfilesDbContext(DbContextOptions<ProfilesDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("profiles");
        var idConverter = new ValueConverter<ProfileId, Guid>(id => id.Value, value => new ProfileId(value));
        var ownerConverter = new ValueConverter<ProfileOwnerId, Guid>(id => id.Value, value => new ProfileOwnerId(value));
        var profile = modelBuilder.Entity<Profile>();
        profile.ToTable("profiles");
        profile.HasKey(x => x.Id);
        profile.Property(x => x.Id).HasConversion(idConverter).ValueGeneratedNever();
        profile.Property(x => x.OwnerId).HasConversion(ownerConverter).IsRequired();
        profile.Property(x => x.Handle).HasMaxLength(30).IsRequired();
        profile.Property(x => x.NormalizedHandle).HasMaxLength(30).IsRequired();
        profile.Property(x => x.DisplayName).HasMaxLength(80).IsRequired();
        profile.Property(x => x.Biography).HasMaxLength(500).IsRequired();
        profile.Property(x => x.Location).HasMaxLength(120).IsRequired();
        profile.Property(x => x.Organization).HasMaxLength(160).IsRequired();
        profile.Property(x => x.WebsiteUrl).HasMaxLength(2048);
        profile.Property(x => x.Theme).HasConversion<string>().HasMaxLength(16);
        profile.Property(x => x.Language).HasConversion<string>().HasMaxLength(16);
        profile.Property(x => x.Version).IsConcurrencyToken();
        profile.HasIndex(x => x.OwnerId).IsUnique();
        profile.HasIndex(x => x.NormalizedHandle).IsUnique();
        profile.Ignore(x => x.CompletenessPercentage);
        profile.Ignore(x => x.DomainEvents);
    }
}
