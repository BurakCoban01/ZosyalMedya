using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Security;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlSecurityChallengeRepository(IdentityDbContext db) : ISecurityChallengeRepository
{
    public Task<SecurityChallenge?> FindByTokenHashAsync(string tokenHash, SecurityChallengePurpose purpose,
        CancellationToken cancellationToken = default) => db.SecurityChallenges.AsNoTracking()
        .SingleOrDefaultAsync(x => x.TokenHash == tokenHash && x.Purpose == purpose, cancellationToken);

    public async Task<SecurityChallenge?> SelectAsync(Expression<Func<SecurityChallenge, bool>> predicate,
        CancellationToken cancellationToken = default)
    {
        var matches = await db.SecurityChallenges.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<SecurityChallenge>> ListByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate,
        QueryOptions<SecurityChallenge>? options = null, CancellationToken cancellationToken = default) =>
        await db.SecurityChallenges.AsNoTracking().Where(predicate).OrderByDescending(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id).Take((options ?? new()).BoundedLimit).ToListAsync(cancellationToken);

    public async Task<SecurityChallengeId> CreateAsync(SecurityChallenge entity, CancellationToken cancellationToken = default)
    {
        db.SecurityChallenges.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        db.Entry(entity).State = EntityState.Detached;
        return entity.Id;
    }

    public async Task<bool> UpdateAsync(Expression<Func<SecurityChallenge, bool>> predicate, SecurityChallenge replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var current = await db.SecurityChallenges.Where(predicate).SingleOrDefaultAsync(cancellationToken);
        if (current is null || expectedVersion.HasValue && current.Version != expectedVersion.Value) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        if (expectedVersion.HasValue) db.Entry(current).Property(x => x.Version).OriginalValue = expectedVersion.Value;
        try { return await db.SaveChangesAsync(cancellationToken) == 1; }
        catch (DbUpdateConcurrencyException) { return false; }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<SecurityChallenge, bool>> predicate,
        CancellationToken cancellationToken = default) =>
        await db.SecurityChallenges.Where(predicate).ExecuteDeleteAsync(cancellationToken);
}
