using Microsoft.EntityFrameworkCore;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Audit.Domain.Entries;
using ZosyalMedya.Modules.Audit.Infrastructure.Persistence;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Audit;

public sealed class AuditRepositoryTests
{
    [Fact]
    public async Task AppendOnlyEntryCanBeFilteredDeterministically()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        await using var db = new AuditDbContext(new DbContextOptionsBuilder<AuditDbContext>().UseNpgsql(
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync();
        var repository = new PostgreSqlAuditRepository(db); var actor = Guid.NewGuid(); var target = Guid.NewGuid();
        var entry = AuditEntry.Create(AuditEntryId.New(), new(actor, "moderation.case.actioned", "Case", target.ToString(),
            AuditSeverity.Critical, new Dictionary<string, string> { ["reason"] = "spam" }, "trace-1"),
            "{\"reason\":\"spam\"}", DateTimeOffset.UtcNow);
        await repository.AppendAsync(entry);
        var result = await repository.SearchAsync(actor, "moderation.case.actioned", "Case", null, null, 10);
        Assert.Equal(entry.Id, Assert.Single(result).Id);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM audit.entries WHERE \"Id\" = {entry.Id.Value}");
    }
}
