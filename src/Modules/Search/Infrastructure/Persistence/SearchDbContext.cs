using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NpgsqlTypes;
using ZosyalMedya.Modules.Search.Domain.Documents;

namespace ZosyalMedya.Modules.Search.Infrastructure.Persistence;

public sealed class SearchDbContext(DbContextOptions<SearchDbContext> options) : DbContext(options)
{
    public DbSet<SearchDocument> Documents => Set<SearchDocument>();
    public DbSet<RecentSearch> RecentSearches => Set<RecentSearch>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("pg_trgm");
        modelBuilder.HasDefaultSchema("search");
        var id = new ValueConverter<SearchDocumentId, Guid>(value => value.Value, value => new(value));
        var document = modelBuilder.Entity<SearchDocument>();
        document.ToTable("documents");
        document.HasKey(x => new { x.Id, x.Type });
        document.Property(x => x.Id).HasConversion(id).ValueGeneratedNever();
        document.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        document.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(20);
        document.Property(x => x.Title).HasMaxLength(200);
        document.Property(x => x.Body).HasMaxLength(10_000);
        document.Property(x => x.DeepLink).HasMaxLength(500);
        document.Property(x => x.Tags).HasColumnType("text[]");
        document.Property<NpgsqlTsVector>("SearchVector").HasColumnType("tsvector")
            .HasComputedColumnSql("to_tsvector('simple', coalesce(\"Title\", '') || ' ' || coalesce(\"Body\", ''))", true);
        document.HasIndex("SearchVector").HasMethod("GIN");
        document.HasIndex(x => x.Title).HasMethod("GIN").HasOperators("gin_trgm_ops");
        document.HasIndex(x => new { x.IsHidden, x.IsDeleted, x.Type, x.UpdatedAtUtc });
        document.Ignore(x => x.DomainEvents);

        var recent = modelBuilder.Entity<RecentSearch>();
        recent.ToTable("recent_searches");
        recent.HasKey(x => new { x.UserId, x.Query });
        recent.Property(x => x.Query).HasMaxLength(100);
        recent.HasIndex(x => new { x.UserId, x.SearchedAtUtc });
    }
}
