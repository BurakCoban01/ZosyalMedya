using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Questions.Domain.Questions;

public readonly record struct QuestionId(Guid Value)
{
    public static QuestionId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public readonly record struct QuestionUserId(Guid Value)
{
    public override string ToString() => Value.ToString("D");
}

public enum QuestionAudience { Profile, Followers, Public }
public enum QuestionStatus { Draft, Scheduled, Published, Answered, Archived, Deleted }

public sealed record QuestionAsked(QuestionId QuestionId, QuestionUserId TargetId, DateTimeOffset OccurredAtUtc) : IDomainEvent;
public sealed record QuestionAnswered(QuestionId QuestionId, QuestionUserId TargetId, DateTimeOffset OccurredAtUtc) : IDomainEvent;

/// <summary>Gönderen kimliği aggregate içinde korunur; anonim normal okuma DTO'larına hiçbir zaman eşlenmez.</summary>
public sealed class Question : AggregateRoot<QuestionId>
{
    private Question() : base(default) { Body = string.Empty; AnswerBody = string.Empty; }

    private Question(QuestionId id, QuestionUserId senderId, QuestionUserId targetId, string body, bool isAnonymous,
        QuestionAudience audience, QuestionStatus status, DateTimeOffset? publishAtUtc, DateTimeOffset now) : base(id)
    {
        SenderId = senderId; TargetId = targetId; Body = body; IsAnonymous = isAnonymous; Audience = audience;
        Status = status; PublishAtUtc = publishAtUtc; AnswerBody = string.Empty; CreatedAtUtc = now; UpdatedAtUtc = now; Version = 1;
        if (status == QuestionStatus.Published) Raise(new QuestionAsked(id, targetId, now));
    }

    public QuestionUserId SenderId { get; private set; }
    public QuestionUserId TargetId { get; private set; }
    public string Body { get; private set; }
    public bool IsAnonymous { get; private set; }
    public QuestionAudience Audience { get; private set; }
    public QuestionStatus Status { get; private set; }
    public string AnswerBody { get; private set; }
    public DateTimeOffset? PublishAtUtc { get; private set; }
    public DateTimeOffset? AnsweredAtUtc { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Question Create(QuestionId id, QuestionUserId senderId, QuestionUserId targetId, string body,
        bool isAnonymous, QuestionAudience audience, bool draft, DateTimeOffset? publishAtUtc, DateTimeOffset now)
    {
        if (senderId.Value == Guid.Empty || targetId.Value == Guid.Empty)
            throw new DomainRuleException("questions.actor_invalid", "Gönderen ve hedef gereklidir.");
        var cleanBody = ValidateText(body, 4, 1000, "questions.body_invalid", "Soru 4-1000 karakter olmalıdır.");
        if (publishAtUtc.HasValue && publishAtUtc.Value <= now)
            throw new DomainRuleException("questions.schedule_invalid", "Planlanan yayın zamanı gelecekte olmalıdır.");
        var status = draft ? QuestionStatus.Draft : publishAtUtc.HasValue ? QuestionStatus.Scheduled : QuestionStatus.Published;
        return new Question(id, senderId, targetId, cleanBody, isAnonymous, audience, status, publishAtUtc, now);
    }

    public void Edit(QuestionUserId actorId, string body, QuestionAudience audience, DateTimeOffset now)
    {
        EnsureSender(actorId);
        if (Status is QuestionStatus.Answered or QuestionStatus.Archived or QuestionStatus.Deleted)
            throw new DomainRuleException("questions.edit_forbidden", "Bu durumdaki soru düzenlenemez.");
        Body = ValidateText(body, 4, 1000, "questions.body_invalid", "Soru 4-1000 karakter olmalıdır.");
        Audience = audience; UpdatedAtUtc = now; Version++;
    }

    public void PublishDue(DateTimeOffset now)
    {
        if (Status != QuestionStatus.Scheduled || PublishAtUtc > now) return;
        Status = QuestionStatus.Published; UpdatedAtUtc = now; Version++; Raise(new QuestionAsked(Id, TargetId, now));
    }

    public void Answer(QuestionUserId actorId, string answer, DateTimeOffset now)
    {
        if (actorId != TargetId) throw new DomainRuleException("questions.answer_forbidden", "Yalnızca hedef profil soruyu yanıtlayabilir.");
        PublishDue(now);
        if (Status != QuestionStatus.Published)
            throw new DomainRuleException("questions.answer_state_invalid", "Yalnızca yayınlanmış sorular yanıtlanabilir.");
        AnswerBody = ValidateText(answer, 1, 5000, "questions.answer_invalid", "Yanıt 1-5000 karakter olmalıdır.");
        Status = QuestionStatus.Answered; AnsweredAtUtc = now; UpdatedAtUtc = now; Version++;
        Raise(new QuestionAnswered(Id, TargetId, now));
    }

    public void Archive(QuestionUserId actorId, DateTimeOffset now)
    {
        if (actorId != TargetId && actorId != SenderId) throw new DomainRuleException("questions.archive_forbidden", "Bu soru arşivlenemez.");
        if (Status == QuestionStatus.Deleted) throw new DomainRuleException("questions.deleted", "Silinmiş soru değiştirilemez.");
        Status = QuestionStatus.Archived; UpdatedAtUtc = now; Version++;
    }

    public void Delete(QuestionUserId actorId, DateTimeOffset now)
    {
        if (actorId != SenderId && actorId != TargetId) throw new DomainRuleException("questions.delete_forbidden", "Bu soru silinemez.");
        Status = QuestionStatus.Deleted; Body = string.Empty; AnswerBody = string.Empty; UpdatedAtUtc = now; Version++;
    }

    private void EnsureSender(QuestionUserId actorId)
    {
        if (actorId != SenderId) throw new DomainRuleException("questions.edit_forbidden", "Yalnızca gönderen soruyu düzenleyebilir.");
    }

    private static string ValidateText(string value, int minimum, int maximum, string code, string message)
    {
        var clean = value.Trim();
        if (clean.Length < minimum || clean.Length > maximum) throw new DomainRuleException(code, message);
        return clean;
    }
}
