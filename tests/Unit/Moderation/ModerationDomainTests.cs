using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Moderation;

public sealed class ModerationDomainTests
{
    [Fact]
    public void ActionAndAppealWorkflowProtectsActorsAndExpiry()
    {
        var now = DateTimeOffset.UtcNow; var reporter = Guid.NewGuid(); var target = Guid.NewGuid(); var moderator = Guid.NewGuid();
        var report = ModerationReport.Create(ReportId.New(), reporter, ModeratedSubjectType.Content, Guid.NewGuid(),
            ReportReason.Spam, "Tekrarlanan zararlı içerik", [], now); var id = ModerationCaseId.New(); report.Triage(id, now);
        var item = ModerationCase.Open(id, report, target, moderator, now);
        Assert.Throws<DomainRuleException>(() => item.Apply(moderator, EnforcementKind.TemporaryPublishRestriction,
            "Geçici kısıtlama", null, now));
        item.Apply(moderator, EnforcementKind.TemporaryPublishRestriction, "Geçici kısıtlama", now.AddDays(2), now);
        Assert.Throws<DomainRuleException>(() => item.Appeal(Guid.NewGuid(), "Karara itiraz ediyorum.", now));
        item.Appeal(target, "Karara kanıtlarımla itiraz ediyorum.", now);
        item.DecideAppeal(moderator, true, "Yeni kanıt kabul edildi.", now);
        Assert.Equal(AppealStatus.Accepted, item.AppealStatus);
        Assert.Equal(ModerationCaseStatus.Closed, item.Status);
    }
}
