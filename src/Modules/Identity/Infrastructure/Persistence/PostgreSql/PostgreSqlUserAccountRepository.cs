using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlUserAccountRepository(IdentityDbContext dbContext) : IUserAccountRepository
{
    public async Task<IReadOnlyList<UserAccount>> ListVisitorPageAsync(string emailDomain, UserId? afterId, int limit,
        CancellationToken cancellationToken = default)
    {
        var suffix = "@" + emailDomain.Trim().TrimStart('@').ToUpperInvariant();
        var after = afterId?.Value ?? Guid.Empty;
        return await dbContext.Users.AsNoTracking()
            .Where(x => x.Id.Value.CompareTo(after) > 0 && x.NormalizedEmail.EndsWith(suffix))
            .OrderBy(x => x.Id)
            .Take(Math.Clamp(limit, 1, QueryOptions<UserAccount>.MaximumLimit))
            .ToListAsync(cancellationToken);
    }

    public async Task<UserAccount?> SelectAsync(Expression<Func<UserAccount, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await dbContext.Users.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<UserAccount>> ListByFilterAsync(
        Expression<Func<UserAccount, bool>> predicate,
        QueryOptions<UserAccount>? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<UserAccount>();
        IQueryable<UserAccount> query = dbContext.Users.AsNoTracking().Where(predicate);
        query = ApplySort(query, options.Sort);
        return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<UserId> CreateAsync(UserAccount entity, CancellationToken cancellationToken = default)
    {
        try
        {
            dbContext.Users.Add(entity);
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.Entry(entity).State = EntityState.Detached;
            return entity.Id;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new PersistenceConflictException("identity.unique_conflict", "Kullanıcı adı veya e-posta zaten kayıtlıdır.", exception);
        }
    }

    public async Task<bool> UpdateAsync(
        Expression<Func<UserAccount, bool>> predicate,
        UserAccount replacement,
        long? expectedVersion = null,
        CancellationToken cancellationToken = default)
    {
        var current = await dbContext.Users.Where(predicate).SingleOrDefaultAsync(cancellationToken);
        if (current is null || (expectedVersion.HasValue && current.Version != expectedVersion.Value)) return false;
        dbContext.Entry(current).CurrentValues.SetValues(replacement);
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

    public async Task<long> DeleteByFilterAsync(Expression<Func<UserAccount, bool>> predicate, CancellationToken cancellationToken = default) =>
        await dbContext.Users.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    private static IQueryable<UserAccount> ApplySort(
        IQueryable<UserAccount> query,
        IReadOnlyList<SortExpression<UserAccount>>? sort)
    {
        if (sort is null || sort.Count == 0) return query.OrderBy(x => x.Id);
        IOrderedQueryable<UserAccount>? ordered = null;
        foreach (var item in sort)
        {
            ordered = ordered is null
                ? item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)
                : item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector);
        }
        return ordered!.ThenBy(x => x.Id);
    }
}
