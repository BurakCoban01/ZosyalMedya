using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Moderation.Contracts;

namespace ZosyalMedya.Modules.Moderation.Domain.Cases;

public readonly record struct ReportId(Guid Value) { public static ReportId New() => new(Guid.NewGuid()); }
public readonly record struct ModerationCaseId(Guid Value) { public static ModerationCaseId New() => new(Guid.NewGuid()); }
public enum ReportReason { Spam, Harassment, Hate, Violence, SexualContent, Impersonation, Privacy, Misinformation, Other }
public enum ReportStatus { Submitted, Triaged, Closed }
public enum ModerationCaseStatus { Open, InReview, Actioned, Appealed, Closed }
public enum EnforcementKind { Warning, ContentRemoval, TemporaryPublishRestriction, TemporaryMessagingRestriction, PermanentRestriction }
public enum AppealStatus { None, Pending, Accepted, Rejected }

public sealed class ModerationReport : AggregateRoot<ReportId>
{
    private ModerationReport() : base(default) { Details = string.Empty; EvidenceReferences = []; }
    private ModerationReport(ReportId id, Guid reporterId, ModeratedSubjectType subjectType, Guid subjectId,
        ReportReason reason, string details, string[] evidence, DateTimeOffset now) : base(id)
    { ReporterId = reporterId; SubjectType = subjectType; SubjectId = subjectId; Reason = reason; Details = details;
        EvidenceReferences = evidence; Status = ReportStatus.Submitted; CreatedAtUtc = UpdatedAtUtc = now; Version = 1; }
    public Guid ReporterId { get; private set; }
    public ModeratedSubjectType SubjectType { get; private set; }
    public Guid SubjectId { get; private set; }
    public ReportReason Reason { get; private set; }
    public string Details { get; private set; }
    public string[] EvidenceReferences { get; private set; }
    public ReportStatus Status { get; private set; }
    public ModerationCaseId? CaseId { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public static ModerationReport Create(ReportId id, Guid reporterId, ModeratedSubjectType subjectType, Guid subjectId,
        ReportReason reason, string details, IReadOnlyList<string>? evidence, DateTimeOffset now)
    {
        if (reporterId == Guid.Empty || subjectId == Guid.Empty || details.Trim().Length is < 5 or > 2000)
            throw new DomainRuleException("moderation.report_invalid", "Rapor bilgileri geçersiz.");
        var references = (evidence ?? []).Select(x => x.Trim()).Where(x => x.Length > 0).Distinct().Take(5).ToArray();
        return new(id, reporterId, subjectType, subjectId, reason, details.Trim(), references, now);
    }
    public void Triage(ModerationCaseId caseId, DateTimeOffset now)
    { if (Status != ReportStatus.Submitted) throw new DomainRuleException("moderation.report_state_invalid", "Rapor daha önce işlendi."); CaseId = caseId; Status = ReportStatus.Triaged; UpdatedAtUtc = now; Version++; }
}

public sealed class CaseNote
{
    private CaseNote() { Text = string.Empty; }
    private CaseNote(long sequence, Guid actorId, string text, DateTimeOffset now) { Sequence = sequence; ActorId = actorId; Text = text; CreatedAtUtc = now; }
    public long Sequence { get; private set; } public Guid ActorId { get; private set; } public string Text { get; private set; } public DateTimeOffset CreatedAtUtc { get; private set; }
    public static CaseNote Create(long sequence, Guid actorId, string text, DateTimeOffset now)
    { if (actorId == Guid.Empty || text.Trim().Length is < 2 or > 2000) throw new DomainRuleException("moderation.note_invalid", "Not geçersiz."); return new(sequence, actorId, text.Trim(), now); }
}
public sealed class EnforcementAction
{
    private EnforcementAction() { Reason = string.Empty; }
    private EnforcementAction(long sequence, EnforcementKind kind, Guid actorId, string reason, DateTimeOffset? expires, DateTimeOffset now)
    { Sequence = sequence; Kind = kind; ActorId = actorId; Reason = reason; ExpiresAtUtc = expires; CreatedAtUtc = now; }
    public long Sequence { get; private set; } public EnforcementKind Kind { get; private set; } public Guid ActorId { get; private set; }
    public string Reason { get; private set; } public DateTimeOffset? ExpiresAtUtc { get; private set; } public DateTimeOffset CreatedAtUtc { get; private set; }
    public static EnforcementAction Create(long sequence, EnforcementKind kind, Guid actorId, string reason, DateTimeOffset? expires, DateTimeOffset now)
    { if (actorId == Guid.Empty || reason.Trim().Length is < 5 or > 1000) throw new DomainRuleException("moderation.action_invalid", "Yaptırım nedeni geçersiz.");
      if (kind is EnforcementKind.TemporaryPublishRestriction or EnforcementKind.TemporaryMessagingRestriction && (!expires.HasValue || expires <= now)) throw new DomainRuleException("moderation.expiry_required", "Geçici yaptırım gelecekte bir bitiş zamanı gerektirir.");
      return new(sequence, kind, actorId, reason.Trim(), expires, now); }
}

public sealed class ModerationCase : AggregateRoot<ModerationCaseId>
{
    private List<CaseNote> _notes = []; private List<EnforcementAction> _actions = [];
    private ModerationCase() : base(default) { AppealText = AppealDecisionReason = string.Empty; }
    private ModerationCase(ModerationCaseId id, ModerationReport report, Guid targetUserId, Guid moderatorId, DateTimeOffset now) : base(id)
    { ReportId = report.Id; SubjectType = report.SubjectType; SubjectId = report.SubjectId; TargetUserId = targetUserId;
      AssignedModeratorId = moderatorId; Status = ModerationCaseStatus.InReview; AppealStatus = AppealStatus.None;
      AppealText = AppealDecisionReason = string.Empty; CreatedAtUtc = UpdatedAtUtc = now; Version = 1; }
    public ReportId ReportId { get; private set; } public ModeratedSubjectType SubjectType { get; private set; }
    public Guid SubjectId { get; private set; } public Guid TargetUserId { get; private set; } public Guid? AssignedModeratorId { get; private set; }
    public ModerationCaseStatus Status { get; private set; } public IReadOnlyList<CaseNote> Notes => _notes.AsReadOnly();
    public IReadOnlyList<EnforcementAction> Actions => _actions.AsReadOnly(); public AppealStatus AppealStatus { get; private set; }
    public string AppealText { get; private set; } public string AppealDecisionReason { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; } public DateTimeOffset UpdatedAtUtc { get; private set; }
    public static ModerationCase Open(ModerationCaseId id, ModerationReport report, Guid targetUserId, Guid moderatorId, DateTimeOffset now)
    { if (targetUserId == Guid.Empty || moderatorId == Guid.Empty) throw new DomainRuleException("moderation.case_invalid", "Vaka hedefi ve moderatörü gereklidir."); return new(id, report, targetUserId, moderatorId, now); }
    public void Assign(Guid actorId, Guid moderatorId, DateTimeOffset now) { EnsureOpen(); if (actorId == Guid.Empty || moderatorId == Guid.Empty) throw new DomainRuleException("moderation.actor_required", "Yetkili aktör gereklidir."); AssignedModeratorId = moderatorId; Touch(now); }
    public void AddNote(Guid actorId, string text, DateTimeOffset now) { EnsureOpen(); _notes.Add(CaseNote.Create(_notes.Count + 1, actorId, text, now)); Touch(now); }
    public void Apply(Guid actorId, EnforcementKind kind, string reason, DateTimeOffset? expires, DateTimeOffset now)
    { EnsureOpen(); _actions.Add(EnforcementAction.Create(_actions.Count + 1, kind, actorId, reason, expires, now)); Status = ModerationCaseStatus.Actioned; Touch(now); }
    public void Appeal(Guid actorId, string text, DateTimeOffset now)
    { if (actorId != TargetUserId || Status != ModerationCaseStatus.Actioned || AppealStatus == AppealStatus.Pending) throw new DomainRuleException("moderation.appeal_forbidden", "Bu vaka için itiraz yapılamaz.");
      if (text.Trim().Length is < 10 or > 2000) throw new DomainRuleException("moderation.appeal_invalid", "İtiraz açıklaması geçersiz."); AppealText = text.Trim(); AppealStatus = AppealStatus.Pending; Status = ModerationCaseStatus.Appealed; Touch(now); }
    public void DecideAppeal(Guid actorId, bool accepted, string reason, DateTimeOffset now)
    { if (actorId == Guid.Empty || AppealStatus != AppealStatus.Pending || reason.Trim().Length < 5) throw new DomainRuleException("moderation.appeal_state_invalid", "İtiraz kararı geçersiz."); AppealStatus = accepted ? AppealStatus.Accepted : AppealStatus.Rejected; AppealDecisionReason = reason.Trim(); Status = ModerationCaseStatus.Closed; Touch(now); }
    public void Close(Guid actorId, string reason, DateTimeOffset now) { AddNote(actorId, reason, now); Status = ModerationCaseStatus.Closed; Touch(now); }
    private void EnsureOpen() { if (Status == ModerationCaseStatus.Closed) throw new DomainRuleException("moderation.case_closed", "Kapalı vaka değiştirilemez."); }
    private void Touch(DateTimeOffset now) { UpdatedAtUtc = now; Version++; }
}
