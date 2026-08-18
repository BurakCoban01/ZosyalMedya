using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;

public sealed class SocialGraphDbContext(DbContextOptions<SocialGraphDbContext> options) : DbContext(options)
{
    public DbSet<Relationship> Relationships => Set<Relationship>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddTransactionalOutbox();
        modelBuilder.HasDefaultSchema("social_graph");
        var idConverter = new ValueConverter<RelationshipId, Guid>(id => id.Value, value => new RelationshipId(value));
        var userConverter = new ValueConverter<GraphUserId, Guid>(id => id.Value, value => new GraphUserId(value));
        var relationship = modelBuilder.Entity<Relationship>();
        relationship.ToTable("relationships");
        relationship.HasKey(x => x.Id);
        relationship.Property(x => x.Id).HasConversion(idConverter).ValueGeneratedNever();
        relationship.Property(x => x.ActorId).HasConversion(userConverter).IsRequired();
        relationship.Property(x => x.TargetId).HasConversion(userConverter).IsRequired();
        relationship.Property(x => x.FollowState).HasConversion<string>().HasMaxLength(16);
        relationship.Property(x => x.Version).IsConcurrencyToken();
        relationship.HasIndex(x => new { x.ActorId, x.TargetId }).IsUnique();
        relationship.HasIndex(x => new { x.TargetId, x.FollowState });
        relationship.Ignore(x => x.DomainEvents);
    }
}
