using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Questions;
public sealed class QuestionTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);
    [Fact] public void OnlyTargetCanAnswerPublishedQuestion() { var sender = new QuestionUserId(Guid.NewGuid()); var target = new QuestionUserId(Guid.NewGuid()); var question = Question.Create(QuestionId.New(), sender, target, "Bu konu hakkında ne düşünüyorsun?", true, QuestionAudience.Profile, false, null, Now); Assert.Throws<DomainRuleException>(() => question.Answer(sender, "Yanıt", Now)); question.Answer(target, "Yetkili yanıt", Now); Assert.Equal(QuestionStatus.Answered, question.Status); Assert.Equal("Yetkili yanıt", question.AnswerBody); }
    [Fact] public void ScheduledQuestionCannotPublishEarly() { var question = Question.Create(QuestionId.New(), new(Guid.NewGuid()), new(Guid.NewGuid()), "Planlı bir soru metni", false, QuestionAudience.Public, false, Now.AddHours(1), Now); question.PublishDue(Now.AddMinutes(30)); Assert.Equal(QuestionStatus.Scheduled, question.Status); question.PublishDue(Now.AddHours(1)); Assert.Equal(QuestionStatus.Published, question.Status); }
    [Fact] public void DeleteCreatesTombstoneAndPreventsAnswer() { var target = new QuestionUserId(Guid.NewGuid()); var question = Question.Create(QuestionId.New(), new(Guid.NewGuid()), target, "Silinecek soru metni", false, QuestionAudience.Profile, false, null, Now); question.Delete(target, Now.AddMinutes(1)); Assert.Equal(QuestionStatus.Deleted, question.Status); Assert.Empty(question.Body); Assert.Throws<DomainRuleException>(() => question.Answer(target, "Yanıt", Now.AddMinutes(2))); }
}
