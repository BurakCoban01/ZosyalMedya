using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Media.Domain.Assets;

namespace ZosyalMedya.Modules.Media.Infrastructure.Persistence;

public sealed class MediaDbContext(DbContextOptions<MediaDbContext> options) : DbContext(options)
{
    public DbSet<MediaAsset> Assets => Set<MediaAsset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("media");
        var id = new ValueConverter<MediaId, Guid>(value => value.Value, value => new(value));
        var owner = new ValueConverter<MediaOwnerId, Guid>(value => value.Value, value => new(value));
        var asset = modelBuilder.Entity<MediaAsset>();
        asset.ToTable("assets");
        asset.HasKey(x => x.Id);
        asset.Property(x => x.Id).HasConversion(id).ValueGeneratedNever();
        asset.Property(x => x.OwnerId).HasConversion(owner);
        asset.Property(x => x.OriginalFileName).HasMaxLength(255);
        asset.Property(x => x.ContentType).HasMaxLength(64);
        asset.Property(x => x.StorageKey).HasMaxLength(300);
        asset.Property(x => x.Sha256).HasMaxLength(64);
        asset.Property(x => x.QuarantineReason).HasMaxLength(500);
        asset.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        asset.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(20);
        asset.Property(x => x.ReservedStorageBytes);
        asset.Property(x => x.Version).IsConcurrencyToken();
        asset.Ignore(x => x.Variants);
        asset.Ignore(x => x.DomainEvents);
        asset.OwnsMany<MediaVariant>("_variants", variant =>
        {
            variant.ToTable("variants");
            variant.WithOwner().HasForeignKey("MediaId");
            variant.HasKey("MediaId", nameof(MediaVariant.Name));
            variant.Property(x => x.Name).HasMaxLength(50);
            variant.Property(x => x.StorageKey).HasMaxLength(300);
            variant.Property(x => x.ContentType).HasMaxLength(64);
        });
        asset.HasIndex(x => new { x.OwnerId, x.Status });
        asset.HasIndex(x => x.PendingExpiresAtUtc).HasFilter("\"PendingExpiresAtUtc\" IS NOT NULL");
        asset.HasIndex(x => x.Sha256);
        asset.HasIndex(x => x.StoryClaimId).HasFilter("\"StoryClaimId\" IS NOT NULL");
    }
}
