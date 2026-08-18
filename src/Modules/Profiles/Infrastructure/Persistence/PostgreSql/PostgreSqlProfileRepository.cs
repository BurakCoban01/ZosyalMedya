using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;

namespace ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlProfileRepository(ProfilesDbContext dbContext) : IProfileRepository
{
    public async Task<Profile?> SelectAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default)
    {
        var matches = await dbContext.Profiles.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<Profile>> ListByFilterAsync(Expression<Func<Profile, bool>> predicate, QueryOptions<Profile>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new QueryOptions<Profile>();
        IQueryable<Profile> query = dbContext.Profiles.AsNoTracking().Where(predicate);
        query = options.Sort is { Count: > 0 } ? ApplySort(query, options.Sort) : query.OrderBy(x => x.Id);
        return await query.Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<ProfileId> CreateAsync(Profile entity, CancellationToken cancellationToken = default)
    {
        try
        {
            dbContext.Profiles.Add(entity);
            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.Entry(entity).State = EntityState.Detached;
            return entity.Id;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new PersistenceConflictException("profiles.unique_conflict", "Profil sahibi veya kullanıcı adı zaten kayıtlıdır.", exception);
        }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Profile, bool>> predicate, Profile replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var current = await dbContext.Profiles.Where(predicate).SingleOrDefaultAsync(cancellationToken);
        if (current is null || (expectedVersion.HasValue && current.Version != expectedVersion.Value)) return false;
        dbContext.Entry(current).CurrentValues.SetValues(replacement);
        if (expectedVersion.HasValue) dbContext.Entry(current).Property(x => x.Version).OriginalValue = expectedVersion.Value;
        try { return await dbContext.SaveChangesAsync(cancellationToken) == 1; }
        catch (DbUpdateConcurrencyException) { return false; }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default) =>
        await dbContext.Profiles.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    private static IQueryable<Profile> ApplySort(IQueryable<Profile> query, IReadOnlyList<SortExpression<Profile>> sort)
    {
        IOrderedQueryable<Profile>? ordered = null;
        foreach (var item in sort)
            ordered = ordered is null
                ? item.Direction == SortDirection.Ascending ? query.OrderBy(item.KeySelector) : query.OrderByDescending(item.KeySelector)
                : item.Direction == SortDirection.Ascending ? ordered.ThenBy(item.KeySelector) : ordered.ThenByDescending(item.KeySelector);
        return ordered!.ThenBy(x => x.Id);
    }
}
