using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql;

public sealed class StoriesDbContext(DbContextOptions<StoriesDbContext> options) : DbContext(options)
{
    public DbSet<Story> Stories => Set<Story>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("stories");
        var id = new ValueConverter<StoryId, Guid>(value => value.Value, value => new(value));
        var owner = new ValueConverter<StoryOwnerId, Guid>(value => value.Value, value => new(value));
        var entity = modelBuilder.Entity<Story>(); entity.ToTable("stories"); entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasConversion(id).ValueGeneratedNever();
        entity.Property(x => x.OwnerId).HasConversion(owner).IsRequired();
        entity.Property(x => x.Caption).HasMaxLength(500).IsRequired();
        entity.Property(x => x.Audience).HasConversion<string>().HasMaxLength(20);
        entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        entity.Property(x => x.Version).IsConcurrencyToken(); entity.Ignore(x => x.DomainEvents);
        entity.HasIndex(x => x.MediaId).IsUnique();
        entity.HasIndex(x => new { x.Status, x.ExpiresAtUtc, x.CreatedAtUtc, x.Id });
        entity.HasIndex(x => new { x.OwnerId, x.Status, x.ExpiresAtUtc, x.CreatedAtUtc, x.Id });
    }
}
