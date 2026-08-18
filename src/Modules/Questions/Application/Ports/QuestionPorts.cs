using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Questions.Domain.Questions;

namespace ZosyalMedya.Modules.Questions.Application.Ports;

public interface IQuestionRepository : IRepository<Question, QuestionId>
{
    Task<IReadOnlyList<Question>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default);
}
