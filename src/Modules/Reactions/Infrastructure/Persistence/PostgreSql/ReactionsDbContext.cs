using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;

namespace ZosyalMedya.Modules.Reactions.Infrastructure.Persistence.PostgreSql;
public sealed class ReactionsDbContext(DbContextOptions<ReactionsDbContext> options) : DbContext(options)
{
    public DbSet<Reaction> Reactions => Set<Reaction>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("reactions");
        var id = new ValueConverter<ReactionId, Guid>(x => x.Value, x => new(x));
        var actor = new ValueConverter<ReactionActorId, Guid>(x => x.Value, x => new(x));
        var content = new ValueConverter<ReactedContentId, Guid>(x => x.Value, x => new(x));
        var entity = modelBuilder.Entity<Reaction>(); entity.ToTable("reactions"); entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasConversion(id).ValueGeneratedNever(); entity.Property(x => x.ActorId).HasConversion(actor);
        entity.Property(x => x.ContentId).HasConversion(content); entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(24);
        entity.Property(x => x.Version).IsConcurrencyToken(); entity.Ignore(x => x.DomainEvents);
        entity.HasIndex(x => new { x.ActorId, x.ContentId }).IsUnique(); entity.HasIndex(x => new { x.ContentId, x.IsActive, x.Kind });
    }
}
public sealed class ReactionsDbContextFactory : IDesignTimeDbContextFactory<ReactionsDbContext>
{
    public ReactionsDbContext CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<ReactionsDbContext>().UseNpgsql(
        Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES") ?? "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
}
