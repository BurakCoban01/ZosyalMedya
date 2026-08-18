using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Audit.Application.Audit;
using ZosyalMedya.Modules.Audit.Domain.Entries;

namespace ZosyalMedya.Modules.Audit.Infrastructure.Persistence;

public sealed class AuditDbContext(DbContextOptions<AuditDbContext> options) : DbContext(options)
{
    public DbSet<AuditEntry> Entries => Set<AuditEntry>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("audit");
        var id = new ValueConverter<AuditEntryId, Guid>(value => value.Value, value => new(value));
        var entry = modelBuilder.Entity<AuditEntry>(); entry.ToTable("entries"); entry.HasKey(x => x.Id);
        entry.Property(x => x.Id).HasConversion(id).ValueGeneratedNever(); entry.Property(x => x.Action).HasMaxLength(100);
        entry.Property(x => x.TargetType).HasMaxLength(100); entry.Property(x => x.TargetId).HasMaxLength(200);
        entry.Property(x => x.Severity).HasConversion<string>().HasMaxLength(20);
        entry.Property(x => x.MetadataJson).HasColumnType("jsonb"); entry.Property(x => x.CorrelationId).HasMaxLength(100);
        entry.HasIndex(x => x.OccurredAtUtc); entry.HasIndex(x => new { x.ActorId, x.OccurredAtUtc });
        entry.HasIndex(x => new { x.TargetType, x.TargetId, x.OccurredAtUtc });
    }
}

public sealed class PostgreSqlAuditRepository(AuditDbContext db) : IAuditRepository
{
    public async Task AppendAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    { db.Add(entry); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); }
    public async Task<IReadOnlyList<AuditEntry>> SearchAsync(Guid? actorId, string? action, string? targetType,
        DateTimeOffset? from, DateTimeOffset? until, int limit, CancellationToken cancellationToken = default)
    {
        var query = db.Entries.AsNoTracking();
        if (actorId.HasValue) query = query.Where(x => x.ActorId == actorId);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(x => x.Action == action);
        if (!string.IsNullOrWhiteSpace(targetType)) query = query.Where(x => x.TargetType == targetType);
        if (from.HasValue) query = query.Where(x => x.OccurredAtUtc >= from);
        if (until.HasValue) query = query.Where(x => x.OccurredAtUtc <= until);
        return await query.OrderByDescending(x => x.OccurredAtUtc).ThenBy(x => x.Id).Take(limit).ToListAsync(cancellationToken);
    }
}
