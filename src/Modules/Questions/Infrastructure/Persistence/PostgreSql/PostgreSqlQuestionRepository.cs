using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Domain.Questions;

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql;
public sealed class PostgreSqlQuestionRepository(QuestionsDbContext db) : IQuestionRepository
{
    public async Task<IReadOnlyList<Question>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) => await db.Questions.AsNoTracking()
        .Where(x => x.Status == QuestionStatus.Scheduled && x.PublishAtUtc <= now)
        .OrderBy(x => x.PublishAtUtc).ThenBy(x => x.Id).Take(Math.Clamp(limit, 1, 200))
        .ToListAsync(cancellationToken);
    public async Task<Question?> SelectAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await db.Questions.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Question>> ListByFilterAsync(Expression<Func<Question, bool>> predicate, QueryOptions<Question>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); IQueryable<Question> query = db.Questions.AsNoTracking().Where(predicate); IOrderedQueryable<Question>? ordered = null; foreach (var item in options.Sort ?? []) { ordered = ordered is null ? (item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)) : (item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector)); } query = ordered?.ThenBy(x => x.Id) ?? query.OrderBy(x => x.Id); return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<QuestionId> CreateAsync(Question entity, CancellationToken cancellationToken = default)
    { try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.Entry(entity).State = EntityState.Detached; return entity.Id; } catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw new PersistenceConflictException("questions.unique_conflict", "Soru zaten kayıtlıdır.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Question, bool>> predicate, Question replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var query = db.Questions.Where(predicate); if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value); var existing = await query.SingleOrDefaultAsync(cancellationToken); if (existing is null) return false; db.Entry(existing).CurrentValues.SetValues(replacement); try { return await db.SaveChangesAsync(cancellationToken) == 1; } catch (DbUpdateConcurrencyException) { return false; } finally { db.Entry(existing).State = EntityState.Detached; } }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default) => await db.Questions.Where(predicate).ExecuteDeleteAsync(cancellationToken);
}
