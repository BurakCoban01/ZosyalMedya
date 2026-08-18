using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Moderation.Application.Cases;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;

namespace ZosyalMedya.Modules.Moderation.Infrastructure.Persistence;

public sealed class ModerationDbContext(DbContextOptions<ModerationDbContext> options) : DbContext(options)
{
    public DbSet<ModerationReport> Reports => Set<ModerationReport>(); public DbSet<ModerationCase> Cases => Set<ModerationCase>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("moderation");
        var reportId = new ValueConverter<ReportId, Guid>(value => value.Value, value => new(value));
        var caseId = new ValueConverter<ModerationCaseId, Guid>(value => value.Value, value => new(value));
        var nullableCaseId = new ValueConverter<ModerationCaseId?, Guid?>(value => value.HasValue ? value.Value.Value : null,
            value => value.HasValue ? new ModerationCaseId(value.Value) : null);
        var report = modelBuilder.Entity<ModerationReport>(); report.ToTable("reports"); report.HasKey(x => x.Id);
        report.Property(x => x.Id).HasConversion(reportId).ValueGeneratedNever(); report.Property(x => x.SubjectType).HasConversion<string>().HasMaxLength(20);
        report.Property(x => x.Reason).HasConversion<string>().HasMaxLength(30); report.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        report.Property(x => x.Details).HasMaxLength(2000); report.Property(x => x.EvidenceReferences).HasColumnType("text[]");
        report.Property(x => x.CaseId).HasConversion(nullableCaseId); report.Property(x => x.Version).IsConcurrencyToken(); report.Ignore(x => x.DomainEvents);
        report.HasIndex(x => new { x.ReporterId, x.SubjectType, x.SubjectId, x.Status }); report.HasIndex(x => x.CreatedAtUtc);
        var item = modelBuilder.Entity<ModerationCase>(); item.ToTable("cases"); item.HasKey(x => x.Id);
        item.Property(x => x.Id).HasConversion(caseId).ValueGeneratedNever(); item.Property(x => x.ReportId).HasConversion(reportId);
        item.Property(x => x.SubjectType).HasConversion<string>().HasMaxLength(20); item.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        item.Property(x => x.AppealStatus).HasConversion<string>().HasMaxLength(20); item.Property(x => x.AppealText).HasMaxLength(2000);
        item.Property(x => x.AppealDecisionReason).HasMaxLength(1000); item.Property(x => x.Version).IsConcurrencyToken();
        item.Ignore(x => x.Notes); item.Ignore(x => x.Actions); item.Ignore(x => x.DomainEvents);
        item.OwnsMany<CaseNote>("_notes", note => { note.ToTable("case_notes"); note.WithOwner().HasForeignKey("CaseId");
            note.HasKey("CaseId", nameof(CaseNote.Sequence)); note.Property(x => x.Text).HasMaxLength(2000); });
        item.OwnsMany<EnforcementAction>("_actions", action => { action.ToTable("enforcement_actions"); action.WithOwner().HasForeignKey("CaseId");
            action.HasKey("CaseId", nameof(EnforcementAction.Sequence)); action.Property(x => x.Kind).HasConversion<string>().HasMaxLength(40);
            action.Property(x => x.Reason).HasMaxLength(1000); });
        item.HasIndex(x => new { x.Status, x.UpdatedAtUtc }); item.HasIndex(x => new { x.TargetUserId, x.Status });
        item.HasIndex(x => new { x.SubjectType, x.SubjectId });
    }
}

public sealed class PostgreSqlModerationRepository(ModerationDbContext db) : IModerationRepository
{
    private IQueryable<ModerationCase> FullCases => db.Cases.Include("_notes").Include("_actions").AsSplitQuery();
    public Task<ModerationReport?> FindOpenReportAsync(Guid reporterId, ModeratedSubjectType type, Guid subjectId, CancellationToken token) =>
        db.Reports.AsNoTracking().SingleOrDefaultAsync(x => x.ReporterId == reporterId && x.SubjectType == type &&
            x.SubjectId == subjectId && x.Status != ReportStatus.Closed, token);
    public async Task CreateReportAsync(ModerationReport report, CancellationToken token) { db.Add(report); await db.SaveChangesAsync(token); db.ChangeTracker.Clear(); }
    public Task<ModerationReport?> GetReportAsync(ReportId id, CancellationToken token) => db.Reports.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, token);
    public Task<ModerationCase?> GetCaseAsync(ModerationCaseId id, CancellationToken token) => FullCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, token);
    public async Task<bool> TriageAsync(ModerationReport report, long reportVersion, ModerationCase item, CancellationToken token)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        var current = await db.Reports.SingleOrDefaultAsync(x => x.Id == report.Id && x.Version == reportVersion, token);
        if (current is null) return false; db.Entry(current).CurrentValues.SetValues(report); db.Add(item);
        try { await db.SaveChangesAsync(token); await transaction.CommitAsync(token); return true; }
        catch (DbUpdateConcurrencyException) { await transaction.RollbackAsync(token); return false; }
        finally { db.ChangeTracker.Clear(); }
    }
    public async Task<bool> UpdateCaseAsync(ModerationCase item, long expectedVersion, CancellationToken token)
    {
        var current = await FullCases.SingleOrDefaultAsync(x => x.Id == item.Id && x.Version == expectedVersion, token);
        if (current is null) return false; db.Entry(current).CurrentValues.SetValues(item);
        Sync(db.Entry(current).Collection("_notes"), item.Notes, x => x.Sequence);
        Sync(db.Entry(current).Collection("_actions"), item.Actions, x => x.Sequence);
        try { return await db.SaveChangesAsync(token) > 0; } catch (DbUpdateConcurrencyException) { return false; }
        finally { db.ChangeTracker.Clear(); }
    }
    public async Task<IReadOnlyList<ModerationCase>> ListCasesAsync(ModerationCaseStatus? status, int limit, CancellationToken token)
    { var query = FullCases.AsNoTracking(); if (status.HasValue) query = query.Where(x => x.Status == status); return await query.OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id).Take(limit).ToListAsync(token); }
    public async Task<bool> HasActiveRestrictionAsync(Guid userId, ModerationCapability capability, DateTimeOffset now, CancellationToken token)
    {
        var cases = await FullCases.AsNoTracking().Where(x => x.TargetUserId == userId && x.AppealStatus != AppealStatus.Accepted)
            .OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id).Take(100).ToListAsync(token);
        return cases.SelectMany(x => x.Actions).Any(action => (action.ExpiresAtUtc is null || action.ExpiresAtUtc > now) &&
            (action.Kind == EnforcementKind.PermanentRestriction || capability == ModerationCapability.Publish && action.Kind == EnforcementKind.TemporaryPublishRestriction ||
             capability == ModerationCapability.Message && action.Kind == EnforcementKind.TemporaryMessagingRestriction));
    }
    public async Task<bool> IsRemovedAsync(ModeratedSubjectType type, Guid subjectId, CancellationToken token)
    { var cases = await FullCases.AsNoTracking().Where(x => x.SubjectType == type && x.SubjectId == subjectId && x.AppealStatus != AppealStatus.Accepted)
            .OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id).Take(100).ToListAsync(token); return cases.SelectMany(x => x.Actions).Any(x => x.Kind == EnforcementKind.ContentRemoval); }
    private static void Sync<T>(Microsoft.EntityFrameworkCore.ChangeTracking.CollectionEntry entry, IEnumerable<T> replacement, Func<T, long> key) where T : class
    { var current = (ICollection<T>)entry.CurrentValue!; foreach (var item in replacement) if (current.All(x => key(x) != key(item))) { current.Add(item); entry.EntityEntry.Context.Entry(item).State = EntityState.Added; } }
}
