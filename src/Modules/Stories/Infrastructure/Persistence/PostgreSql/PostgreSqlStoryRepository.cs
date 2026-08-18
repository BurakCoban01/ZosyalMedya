using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlStoryRepository(StoriesDbContext db) : IStoryRepository
{
    public async Task<IReadOnlyList<Story>> ListPageAsync(StoryPageQuery query, CancellationToken cancellationToken = default)
    {
        var source = query.BeforeTime.HasValue && query.BeforeId.HasValue
            ? db.Stories.FromSqlInterpolated($"""
                SELECT * FROM stories.stories
                WHERE "CreatedAtUtc" < {query.BeforeTime.Value}
                   OR ("CreatedAtUtc" = {query.BeforeTime.Value} AND "Id" > {query.BeforeId.Value.Value})
                """)
            : db.Stories;
        var items = source.AsNoTracking().Where(x => x.Status == StoryStatus.Active && x.ExpiresAtUtc > query.Now);
        if (query.OwnerId.HasValue) items = items.Where(x => x.OwnerId == query.OwnerId.Value);
        return await items.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Take(Math.Clamp(query.Limit, 1, 100)).ToListAsync(cancellationToken);
    }

    public Task<Story?> FindActiveByMediaAsync(Guid mediaId, DateTimeOffset now, CancellationToken cancellationToken = default) =>
        db.Stories.AsNoTracking().SingleOrDefaultAsync(x => x.MediaId == mediaId && x.Status == StoryStatus.Active &&
            x.ExpiresAtUtc > now, cancellationToken);
    public async Task<Story?> SelectAsync(Expression<Func<Story, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await db.Stories.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Story>> ListByFilterAsync(Expression<Func<Story, bool>> predicate,
        QueryOptions<Story>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await db.Stories.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<StoryId> CreateAsync(Story entity, CancellationToken cancellationToken = default)
    {
        try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.Entry(entity).State = EntityState.Detached; return entity.Id; }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { db.ChangeTracker.Clear(); throw new PersistenceConflictException("stories.media_conflict", "Bu medya zaten bir hikâyeye bağlı.", exception); }
    }
    public async Task<bool> UpdateAsync(Expression<Func<Story, bool>> predicate, Story replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = db.Stories.Where(predicate); if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion);
        var existing = await query.SingleOrDefaultAsync(cancellationToken); if (existing is null) return false;
        db.Entry(existing).CurrentValues.SetValues(replacement);
        try { return await db.SaveChangesAsync(cancellationToken) == 1; }
        catch (DbUpdateConcurrencyException) { return false; }
        finally { db.Entry(existing).State = EntityState.Detached; }
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Story, bool>> predicate, CancellationToken cancellationToken = default) =>
        await db.Stories.Where(predicate).ExecuteDeleteAsync(cancellationToken);
}
