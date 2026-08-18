using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Saved;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlSavedContentRepository(ContentDbContext db) : ISavedContentRepository
{
    public async Task<SavedContent?> SelectAsync(Expression<Func<SavedContent, bool>> predicate, CancellationToken cancellationToken = default)
    { var rows = await db.SavedContents.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return rows.SingleOrDefault(); }
    public async Task<IReadOnlyList<SavedContent>> ListByFilterAsync(Expression<Func<SavedContent, bool>> predicate, QueryOptions<SavedContent>? options = null, CancellationToken cancellationToken = default) =>
        await db.SavedContents.AsNoTracking().Where(predicate).OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Take((options ?? new()).BoundedLimit).ToListAsync(cancellationToken);
    public async Task<IReadOnlyList<SavedContent>> ListPageAsync(SavedContentPageQuery request, CancellationToken cancellationToken = default)
    {
        var query = db.SavedContents.AsNoTracking().Where(x => x.OwnerId == request.OwnerId);
        if (request.Collection is not null) query = query.Where(x => x.Collection == request.Collection);
        if (request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue)
            query = query.Where(x => x.CreatedAtUtc < request.CursorCreatedAtUtc || x.CreatedAtUtc == request.CursorCreatedAtUtc && x.Id.Value.CompareTo(request.CursorId.Value.Value) > 0);
        return await query.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Take(Math.Clamp(request.Limit, 1, 100)).ToListAsync(cancellationToken);
    }
    public async Task<SavedContentId> CreateAsync(SavedContent entity, CancellationToken cancellationToken = default)
    { try { db.SavedContents.Add(entity); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); return entity.Id; } catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw new PersistenceConflictException("saved.duplicate", "İçerik koleksiyonda zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<SavedContent, bool>> predicate, SavedContent replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    { var current = await db.SavedContents.Where(predicate).SingleOrDefaultAsync(cancellationToken); if (current is null || expectedVersion.HasValue && current.Version != expectedVersion) return false; db.Entry(current).CurrentValues.SetValues(replacement); return await db.SaveChangesAsync(cancellationToken) == 1; }
    public async Task<long> DeleteByFilterAsync(Expression<Func<SavedContent, bool>> predicate, CancellationToken cancellationToken = default) => await db.SavedContents.Where(predicate).ExecuteDeleteAsync(cancellationToken);
}
