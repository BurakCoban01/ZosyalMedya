using System.Linq.Expressions;
using System.Buffers.Binary;
using Microsoft.EntityFrameworkCore;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Domain.Assets;

namespace ZosyalMedya.Modules.Media.Infrastructure.Persistence;

public sealed class PostgreSqlMediaRepository(MediaDbContext db) : IMediaRepository
{
    private IQueryable<MediaAsset> Full => db.Assets.Include("_variants");

    public async Task<MediaAsset?> SelectAsync(Expression<Func<MediaAsset, bool>> predicate,
        CancellationToken cancellationToken = default)
    {
        var matches = await Full.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken);
        return matches.SingleOrDefault();
    }

    public async Task<IReadOnlyList<MediaAsset>> ListByFilterAsync(Expression<Func<MediaAsset, bool>> predicate,
        QueryOptions<MediaAsset>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new();
        return await Full.AsNoTracking().Where(predicate).OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<MediaId> CreateAsync(MediaAsset entity, CancellationToken cancellationToken = default)
    {
        db.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
        return entity.Id;
    }

    public async Task<bool> UpdateAsync(Expression<Func<MediaAsset, bool>> predicate, MediaAsset replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = Full.Where(predicate);
        if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value);
        var current = await query.SingleOrDefaultAsync(cancellationToken);
        if (current is null) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        var variants = (ICollection<MediaVariant>)db.Entry(current).Collection("_variants").CurrentValue!;
        foreach (var variant in replacement.Variants.Where(replacementVariant =>
                     variants.All(existing => existing.Name != replacementVariant.Name))) variants.Add(variant);
        try { return await db.SaveChangesAsync(cancellationToken) > 0; }
        catch (DbUpdateConcurrencyException) { return false; }
        finally { db.ChangeTracker.Clear(); }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<MediaAsset, bool>> predicate,
        CancellationToken cancellationToken = default) =>
        await db.Assets.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    public async Task<long> SumActiveBytesAsync(MediaOwnerId ownerId, CancellationToken cancellationToken = default) =>
        await db.Assets.Where(x => x.OwnerId == ownerId && x.Status != MediaStatus.Deleted && x.Status != MediaStatus.Quarantined)
            .SumAsync(x => (long?)x.ReservedStorageBytes, cancellationToken) ?? 0;

    public async Task<bool> TryCreateWithinQuotaAsync(MediaAsset entity, long quotaBytes,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var lockKey = BinaryPrimitives.ReadInt64LittleEndian(entity.OwnerId.Value.ToByteArray());
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({lockKey})", cancellationToken);
        var activeBytes = await db.Assets.Where(x => x.OwnerId == entity.OwnerId &&
                x.Status != MediaStatus.Deleted && x.Status != MediaStatus.Quarantined)
            .SumAsync(x => (long?)x.ReservedStorageBytes, cancellationToken) ?? 0;
        if (activeBytes > quotaBytes - entity.ReservedStorageBytes)
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return false;
        }
        db.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        db.ChangeTracker.Clear();
        return true;
    }

    public async Task<bool> TryUpdateStorageReservationWithinQuotaAsync(MediaAsset entity, long expectedVersion,
        long quotaBytes, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var lockKey = BinaryPrimitives.ReadInt64LittleEndian(entity.OwnerId.Value.ToByteArray());
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({lockKey})", cancellationToken);
        var current = await Full.SingleOrDefaultAsync(x => x.Id == entity.Id && x.Version == expectedVersion,
            cancellationToken);
        if (current is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return false;
        }
        var otherBytes = await db.Assets.Where(x => x.OwnerId == entity.OwnerId && x.Id != entity.Id &&
                x.Status != MediaStatus.Deleted && x.Status != MediaStatus.Quarantined)
            .SumAsync(x => (long?)x.ReservedStorageBytes, cancellationToken) ?? 0;
        if (otherBytes > quotaBytes - entity.ReservedStorageBytes)
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return false;
        }
        db.Entry(current).CurrentValues.SetValues(entity);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        db.ChangeTracker.Clear();
        return true;
    }

    public async Task<IReadOnlyList<MediaAsset>> ListExpiredPendingAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) =>
        await Full.AsNoTracking().Where(x =>
                (x.Status == MediaStatus.Pending || x.Status == MediaStatus.Processing ||
                 x.Status == MediaStatus.Quarantined || x.Status == MediaStatus.Deleted) &&
                x.PendingExpiresAtUtc < now)
            .OrderBy(x => x.PendingExpiresAtUtc).Take(Math.Clamp(limit, 1, 500)).ToListAsync(cancellationToken);

    public async Task<bool> TryMarkExpiredDeletedAsync(MediaId id, long expectedVersion, DateTimeOffset now,
        CancellationToken cancellationToken = default) =>
        await db.Assets.Where(x => x.Id == id && x.Version == expectedVersion && x.PendingExpiresAtUtc < now &&
                (x.Status == MediaStatus.Pending || x.Status == MediaStatus.Processing || x.Status == MediaStatus.Quarantined))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.Status, MediaStatus.Deleted)
                .SetProperty(x => x.DeletedAtUtc, now)
                .SetProperty(x => x.UpdatedAtUtc, now)
                .SetProperty(x => x.Version, x => x.Version + 1), cancellationToken) == 1;
}
