using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlUserSessionRepository(IdentityDbContext dbContext) : IUserSessionRepository
{
    public async Task<UserSession?> FindByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        var matches = await dbContext.Sessions.AsNoTracking()
            .Where(x => x.RefreshTokenHash == tokenHash || EF.Property<string[]>(x, "_consumedTokenHashes").Contains(tokenHash))
            .OrderBy(x => x.Id)
            .Take(2)
            .ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<UserSession?> SelectAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await dbContext.Sessions.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<UserSession>> ListByFilterAsync(
        Expression<Func<UserSession, bool>> predicate,
        QueryOptions<UserSession>? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<UserSession>();
        IQueryable<UserSession> query = dbContext.Sessions.AsNoTracking().Where(predicate);
        query = options.Sort is { Count: > 0 }
            ? ApplySort(query, options.Sort)
            : query.OrderByDescending(x => x.LastUsedAtUtc).ThenBy(x => x.Id);
        return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<SessionId> CreateAsync(UserSession entity, CancellationToken cancellationToken = default)
    {
        try
        {
            dbContext.Sessions.Add(entity);
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.Entry(entity).State = EntityState.Detached;
            return entity.Id;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new PersistenceConflictException("identity.session_conflict", "Oturum oluşturulamadı.", exception);
        }
    }

    public async Task<bool> UpdateAsync(
        Expression<Func<UserSession, bool>> predicate,
        UserSession replacement,
        long? expectedVersion = null,
        CancellationToken cancellationToken = default)
    {
        var current = await dbContext.Sessions.Where(predicate).SingleOrDefaultAsync(cancellationToken);
        if (current is null || (expectedVersion.HasValue && current.Version != expectedVersion.Value)) return false;
        dbContext.Entry(current).CurrentValues.SetValues(replacement);
        dbContext.Entry(current).Property<string[]>("_consumedTokenHashes").CurrentValue = replacement.ConsumedTokenHashes.ToArray();
        if (expectedVersion.HasValue) dbContext.Entry(current).Property(x => x.Version).OriginalValue = expectedVersion.Value;
        try
        {
            return await dbContext.SaveChangesAsync(cancellationToken) == 1;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<UserSession, bool>> predicate, CancellationToken cancellationToken = default) =>
        await dbContext.Sessions.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    private static IQueryable<UserSession> ApplySort(IQueryable<UserSession> query, IReadOnlyList<SortExpression<UserSession>> sort)
    {
        IOrderedQueryable<UserSession>? ordered = null;
        foreach (var item in sort)
        {
            ordered = ordered is null
                ? item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)
                : item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector);
        }
        return ordered!.ThenBy(x => x.Id);
    }
}
