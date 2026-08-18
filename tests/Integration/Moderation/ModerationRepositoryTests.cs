using Microsoft.EntityFrameworkCore;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using ZosyalMedya.Modules.Moderation.Infrastructure.Persistence;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Moderation;

public sealed class ModerationRepositoryTests
{
    [Fact]
    public async Task TriageActionsRestrictionsAndAppealsPersist()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        await using var db = new ModerationDbContext(new DbContextOptionsBuilder<ModerationDbContext>().UseNpgsql(
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync(); var repository = new PostgreSqlModerationRepository(db); var now = DateTimeOffset.UtcNow;
        var target = Guid.NewGuid(); var moderator = Guid.NewGuid(); var subject = Guid.NewGuid();
        var report = ModerationReport.Create(ReportId.New(), Guid.NewGuid(), ModeratedSubjectType.Content, subject,
            ReportReason.Harassment, "Açıklamalı kanıt metni", ["media:evidence"], now); await repository.CreateReportAsync(report, default);
        var reportVersion = report.Version; var caseId = ModerationCaseId.New(); report.Triage(caseId, now);
        var item = ModerationCase.Open(caseId, report, target, moderator, now);
        Assert.True(await repository.TriageAsync(report, reportVersion, item, default)); var version = item.Version;
        item.AddNote(moderator, "İlk inceleme tamamlandı.", now);
        item.Apply(moderator, EnforcementKind.TemporaryPublishRestriction, "İki günlük kısıtlama", now.AddDays(2), now);
        Assert.True(await repository.UpdateCaseAsync(item, version, default));
        Assert.True(await repository.HasActiveRestrictionAsync(target, ModerationCapability.Publish, now, default));
        Assert.False(await repository.HasActiveRestrictionAsync(target, ModerationCapability.Message, now, default));
        var loaded = await repository.GetCaseAsync(caseId, default); Assert.NotNull(loaded); Assert.Single(loaded.Notes); Assert.Single(loaded.Actions);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM moderation.cases WHERE \"Id\" = {caseId.Value}");
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM moderation.reports WHERE \"Id\" = {report.Id.Value}");
    }
}
