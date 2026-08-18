using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlPostRepository(ContentDbContext db) : IPostRepository
{
    public async Task<IReadOnlyList<Post>> ListFeedPageAsync(
        PostFeedQuery request,
        CancellationToken cancellationToken = default)
    {
        var limit = Math.Clamp(request.Limit, 1, 100);
        var cursorTime = request.CursorPublishedAtUtc;
        var cursorId = request.CursorId?.Value;
        IQueryable<Post> query;

        if (request.PublicOnly)
        {
            query = cursorTime.HasValue && cursorId.HasValue
                ? db.Posts.FromSqlInterpolated($"""
                    SELECT * FROM content.posts
                    WHERE "Status" = 'Published' AND "Visibility" = 'Public'
                      AND ("PublishedAtUtc" < {cursorTime.Value}
                           OR ("PublishedAtUtc" = {cursorTime.Value} AND "Id" > {cursorId.Value}))
                    ORDER BY "PublishedAtUtc" DESC, "Id" ASC
                    LIMIT {limit}
                    """)
                : db.Posts.FromSqlInterpolated($"""
                    SELECT * FROM content.posts
                    WHERE "Status" = 'Published' AND "Visibility" = 'Public'
                    ORDER BY "PublishedAtUtc" DESC, "Id" ASC
                    LIMIT {limit}
                    """);
        }
        else
        {
            var authorIds = request.AuthorIds?.Select(x => x.Value).ToArray() ?? [];
            query = cursorTime.HasValue && cursorId.HasValue
                ? db.Posts.FromSqlInterpolated($"""
                    SELECT * FROM content.posts
                    WHERE "Status" = 'Published' AND "AuthorId" = ANY({authorIds})
                      AND ("PublishedAtUtc" < {cursorTime.Value}
                           OR ("PublishedAtUtc" = {cursorTime.Value} AND "Id" > {cursorId.Value}))
                    ORDER BY "PublishedAtUtc" DESC, "Id" ASC
                    LIMIT {limit}
                    """)
                : db.Posts.FromSqlInterpolated($"""
                    SELECT * FROM content.posts
                    WHERE "Status" = 'Published' AND "AuthorId" = ANY({authorIds})
                    ORDER BY "PublishedAtUtc" DESC, "Id" ASC
                    LIMIT {limit}
                    """);
        }

        return await query.AsNoTracking().ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Post>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) => await db.Posts.AsNoTracking()
        .Where(x => x.Status == PostStatus.Scheduled && x.PublishAtUtc <= now)
        .OrderBy(x => x.PublishAtUtc).ThenBy(x => x.Id).Take(Math.Clamp(limit, 1, 200)).ToListAsync(cancellationToken);

    public async Task<Post?> SelectAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var items = await db.Posts.AsNoTracking().Include("_revisions").Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return items.SingleOrDefault();
    }

    public async Task<IReadOnlyList<Post>> ListByFilterAsync(Expression<Func<Post, bool>> predicate,
        QueryOptions<Post>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new(); IQueryable<Post> query = db.Posts.AsNoTracking().Where(predicate); IOrderedQueryable<Post>? ordered = null;
        foreach (var item in options.Sort ?? [])
            ordered = ordered is null
                ? item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)
                : item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector);
        query = ordered?.ThenBy(x => x.Id) ?? query.OrderBy(x => x.Id);
        return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<PostId> CreateAsync(Post entity, CancellationToken cancellationToken = default)
    {
        try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); return entity.Id; }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new PersistenceConflictException("content.unique_conflict", "İçerik zaten kayıtlıdır.", exception); }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Post, bool>> predicate, Post replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = db.Posts.Include("_revisions").Where(predicate);
        if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value);
        var current = await query.SingleOrDefaultAsync(cancellationToken); if (current is null) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        var collection = db.Entry(current).Collection("_revisions"); await collection.LoadAsync(cancellationToken);
        var revisions = (ICollection<PostRevision>)collection.CurrentValue!;
        foreach (var revision in replacement.Revisions.Where(x => revisions.All(existing => existing.Revision != x.Revision)))
        {
            revisions.Add(revision);
            db.Entry(revision).State = EntityState.Added;
        }
        try { return await db.SaveChangesAsync(cancellationToken) > 0; }
        catch (DbUpdateConcurrencyException) { return false; }
        finally { db.ChangeTracker.Clear(); }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default)
        => await db.Posts.Where(predicate).ExecuteDeleteAsync(cancellationToken);
}
