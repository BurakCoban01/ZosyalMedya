using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using ZosyalMedya.Modules.Search.Contracts;

namespace ZosyalMedya.Modules.Moderation.Application.Cases;

public interface IModerationRepository
{
    Task<ModerationReport?> FindOpenReportAsync(Guid reporterId, ModeratedSubjectType type, Guid subjectId, CancellationToken token);
    Task CreateReportAsync(ModerationReport report, CancellationToken token);
    Task<ModerationReport?> GetReportAsync(ReportId id, CancellationToken token);
    Task<ModerationCase?> GetCaseAsync(ModerationCaseId id, CancellationToken token);
    Task<bool> TriageAsync(ModerationReport report, long reportVersion, ModerationCase item, CancellationToken token);
    Task<bool> UpdateCaseAsync(ModerationCase item, long expectedVersion, CancellationToken token);
    Task<IReadOnlyList<ModerationCase>> ListCasesAsync(ModerationCaseStatus? status, int limit, CancellationToken token);
    Task<bool> HasActiveRestrictionAsync(Guid userId, ModerationCapability capability, DateTimeOffset now, CancellationToken token);
    Task<bool> IsRemovedAsync(ModeratedSubjectType type, Guid subjectId, CancellationToken token);
}

public sealed record ModerationReportView(Guid Id, string SubjectType, Guid SubjectId, string Reason, string Status,
    DateTimeOffset CreatedAtUtc);
public sealed record ModerationCaseView(Guid Id, Guid ReportId, string SubjectType, Guid SubjectId, Guid TargetUserId,
    Guid? AssignedModeratorId, string Status, IReadOnlyList<string> Actions, string AppealStatus,
    DateTimeOffset UpdatedAtUtc, long Version);

public sealed class CreateReportHandler(IModerationRepository repository, IClock clock)
{
    public async Task<Result<ModerationReportView>> HandleAsync(Guid reporterId, ModeratedSubjectType type, Guid subjectId,
        ReportReason reason, string details, IReadOnlyList<string>? evidence, CancellationToken token)
    {
        if (await repository.FindOpenReportAsync(reporterId, type, subjectId, token) is not null)
            return Result.Failure<ModerationReportView>("moderation.duplicate_report", "Bu hedef için açık bir raporunuz var.");
        try
        {
            var report = ModerationReport.Create(ReportId.New(), reporterId, type, subjectId, reason, details, evidence, clock.UtcNow);
            await repository.CreateReportAsync(report, token);
            return Result.Success(new ModerationReportView(report.Id.Value, report.SubjectType.ToString(), report.SubjectId,
                report.Reason.ToString(), report.Status.ToString(), report.CreatedAtUtc));
        }
        catch (DomainRuleException exception) { return Result.Failure<ModerationReportView>(exception.Code, exception.Message); }
    }
}

public sealed class TriageReportHandler(IModerationRepository repository, IAuditModule audit, IClock clock)
{
    public async Task<Result<ModerationCaseView>> HandleAsync(Guid reportId, Guid moderatorId, Guid targetUserId,
        string correlationId, CancellationToken token)
    {
        var report = await repository.GetReportAsync(new(reportId), token);
        if (report is null) return Result.Failure<ModerationCaseView>("moderation.report_not_found", "Rapor bulunamadı.");
        var version = report.Version; var caseId = ModerationCaseId.New();
        try
        {
            report.Triage(caseId, clock.UtcNow);
            var item = ModerationCase.Open(caseId, report, targetUserId, moderatorId, clock.UtcNow);
            if (!await repository.TriageAsync(report, version, item, token))
                return Result.Failure<ModerationCaseView>("moderation.concurrency_conflict", "Rapor eşzamanlı işlendi.");
            await audit.WriteAsync(new(moderatorId, "moderation.report.triaged", "ModerationCase", caseId.Value.ToString("D"),
                AuditSeverity.Warning, new Dictionary<string, string> { ["reportId"] = reportId.ToString("D") }, correlationId), token);
            return Result.Success(Map(item));
        }
        catch (DomainRuleException exception) { return Result.Failure<ModerationCaseView>(exception.Code, exception.Message); }
    }
    internal static ModerationCaseView Map(ModerationCase item) => new(item.Id.Value, item.ReportId.Value,
        item.SubjectType.ToString(), item.SubjectId, item.TargetUserId, item.AssignedModeratorId, item.Status.ToString(),
        item.Actions.Select(x => x.Kind.ToString()).ToArray(), item.AppealStatus.ToString(), item.UpdatedAtUtc, item.Version);
}

public enum ModerationCaseChange { Assign, AddNote, ApplyAction, Close, DecideAppeal }
public sealed class ChangeModerationCaseHandler(IModerationRepository repository, ISearchModule search, IAuditModule audit, IClock clock)
{
    public async Task<Result<ModerationCaseView>> HandleAsync(Guid caseId, Guid actorId, ModerationCaseChange change,
        Guid? assigneeId, string reason, EnforcementKind? enforcement, DateTimeOffset? expiresAtUtc,
        bool? appealAccepted, string correlationId, CancellationToken token)
    {
        var item = await repository.GetCaseAsync(new(caseId), token);
        if (item is null) return Result.Failure<ModerationCaseView>("moderation.case_not_found", "Moderasyon vakası bulunamadı.");
        var version = item.Version;
        try
        {
            switch (change)
            {
                case ModerationCaseChange.Assign: item.Assign(actorId, assigneeId ?? Guid.Empty, clock.UtcNow); break;
                case ModerationCaseChange.AddNote: item.AddNote(actorId, reason, clock.UtcNow); break;
                case ModerationCaseChange.ApplyAction: item.Apply(actorId, enforcement ?? EnforcementKind.Warning, reason, expiresAtUtc, clock.UtcNow); break;
                case ModerationCaseChange.Close: item.Close(actorId, reason, clock.UtcNow); break;
                case ModerationCaseChange.DecideAppeal: item.DecideAppeal(actorId, appealAccepted ?? false, reason, clock.UtcNow); break;
            }
        }
        catch (DomainRuleException exception) { return Result.Failure<ModerationCaseView>(exception.Code, exception.Message); }
        if (!await repository.UpdateCaseAsync(item, version, token))
            return Result.Failure<ModerationCaseView>("moderation.concurrency_conflict", "Vaka eşzamanlı güncellendi.");
        if (change == ModerationCaseChange.ApplyAction && enforcement == EnforcementKind.ContentRemoval)
        {
            var searchType = item.SubjectType switch { ModeratedSubjectType.Content => SearchDocumentType.Content,
                ModeratedSubjectType.Question => SearchDocumentType.Question, ModeratedSubjectType.Community => SearchDocumentType.Community,
                _ => (SearchDocumentType?)null };
            if (searchType.HasValue) await search.RemoveAsync(searchType.Value, item.SubjectId, item.Version, token);
        }
        await audit.WriteAsync(new(actorId, $"moderation.case.{change}", "ModerationCase", caseId.ToString("D"),
            change == ModerationCaseChange.ApplyAction ? AuditSeverity.Critical : AuditSeverity.Warning,
            new Dictionary<string, string> { ["enforcement"] = enforcement?.ToString() ?? string.Empty, ["reason"] = reason }, correlationId), token);
        return Result.Success(TriageReportHandler.Map(item));
    }
}

public sealed class AppealModerationCaseHandler(IModerationRepository repository, IClock clock)
{
    public async Task<Result<ModerationCaseView>> HandleAsync(Guid caseId, Guid actorId, string text, CancellationToken token)
    {
        var item = await repository.GetCaseAsync(new(caseId), token);
        if (item is null) return Result.Failure<ModerationCaseView>("moderation.case_not_found", "Moderasyon vakası bulunamadı.");
        var version = item.Version;
        try { item.Appeal(actorId, text, clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<ModerationCaseView>(exception.Code, exception.Message); }
        return await repository.UpdateCaseAsync(item, version, token) ? Result.Success(TriageReportHandler.Map(item))
            : Result.Failure<ModerationCaseView>("moderation.concurrency_conflict", "Vaka eşzamanlı güncellendi.");
    }
}

public sealed class ListModerationCasesHandler(IModerationRepository repository)
{
    public async Task<IReadOnlyList<ModerationCaseView>> HandleAsync(ModerationCaseStatus? status, int limit, CancellationToken token) =>
        (await repository.ListCasesAsync(status, Math.Clamp(limit, 1, 100), token)).Select(TriageReportHandler.Map).ToArray();
}

public sealed class ModerationModule(IModerationRepository repository, IClock clock) : IModerationModule
{
    public async Task<bool> CanPerformAsync(Guid userId, ModerationCapability capability, CancellationToken cancellationToken = default) =>
        !await repository.HasActiveRestrictionAsync(userId, capability, clock.UtcNow, cancellationToken);
    public Task<bool> IsSubjectRemovedAsync(ModeratedSubjectType type, Guid subjectId, CancellationToken cancellationToken = default) =>
        repository.IsRemovedAsync(type, subjectId, cancellationToken);
}
