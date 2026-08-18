using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlRelationshipRepository(SocialGraphDbContext dbContext) : IRelationshipRepository
{
    public async Task<Relationship?> SelectAsync(Expression<Func<Relationship, bool>> predicate, CancellationToken cancellationToken = default)
    { var matches = await dbContext.Relationships.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return matches.SingleOrDefault(); }

    public async Task<IReadOnlyList<Relationship>> ListByFilterAsync(Expression<Func<Relationship, bool>> predicate, QueryOptions<Relationship>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<Relationship>();
        IQueryable<Relationship> query = dbContext.Relationships.AsNoTracking().Where(predicate);
        query = options.Sort is { Count: > 0 } ? ApplySort(query, options.Sort) : query.OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id);
        return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<RelationshipId> CreateAsync(Relationship entity, CancellationToken cancellationToken = default)
    {
        try
        {
            dbContext.Relationships.Add(entity);
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.Entry(entity).State = EntityState.Detached;
            return entity.Id;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new PersistenceConflictException("social_graph.unique_conflict", "İlişki zaten kayıtlıdır.", exception); }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Relationship, bool>> predicate, Relationship replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var current = await dbContext.Relationships.Where(predicate).SingleOrDefaultAsync(cancellationToken);
        if (current is null || (expectedVersion.HasValue && current.Version != expectedVersion.Value)) return false;
        dbContext.Entry(current).State = EntityState.Detached;
        dbContext.Attach(replacement);
        dbContext.Entry(replacement).State = EntityState.Modified;
        if (expectedVersion.HasValue) dbContext.Entry(replacement).Property(x => x.Version).OriginalValue = expectedVersion.Value;
        try { return await dbContext.SaveChangesAsync(cancellationToken) > 0; } catch (DbUpdateConcurrencyException) { return false; }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<Relationship, bool>> predicate, CancellationToken cancellationToken = default) =>
        await dbContext.Relationships.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    public Task<long> CountAsync(GraphUserId ownerId, RelationshipReadKind kind,
        CancellationToken cancellationToken = default) => Query(ownerId, kind).LongCountAsync(cancellationToken);

    public async Task<IReadOnlyList<Relationship>> ListPageAsync(RelationshipPageQuery query,
        CancellationToken cancellationToken = default) => await Query(query.OwnerId, query.Kind)
        .OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id)
        .Skip(Math.Max(0, query.Offset)).Take(Math.Clamp(query.Limit, 1, 51))
        .AsNoTracking().ToListAsync(cancellationToken);

    private IQueryable<Relationship> Query(GraphUserId ownerId, RelationshipReadKind kind) => kind switch
    {
        RelationshipReadKind.Followers => dbContext.Relationships.Where(x => x.TargetId == ownerId && x.FollowState == FollowState.Following && !x.IsBlocked),
        RelationshipReadKind.Following => dbContext.Relationships.Where(x => x.ActorId == ownerId && x.FollowState == FollowState.Following && !x.IsBlocked),
        RelationshipReadKind.PendingIncoming => dbContext.Relationships.Where(x => x.TargetId == ownerId && x.FollowState == FollowState.Pending && !x.IsBlocked),
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };

    private static IQueryable<Relationship> ApplySort(IQueryable<Relationship> query, IReadOnlyList<SortExpression<Relationship>> sort)
    {
        IOrderedQueryable<Relationship>? ordered = null;
        foreach (var item in sort) ordered = ordered is null
            ? item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)
            : item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector);
        return ordered!.ThenBy(x => x.Id);
    }
}
