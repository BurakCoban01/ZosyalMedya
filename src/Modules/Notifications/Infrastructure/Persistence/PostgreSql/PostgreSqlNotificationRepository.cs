using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Notifications.Application.Ports;
using ZosyalMedya.Modules.Notifications.Domain.Inbox;

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlNotificationRepository(NotificationsDbContext db) : INotificationRepository
{
    public async Task<Notification?> SelectAsync(Expression<Func<Notification, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await db.Notifications.AsNoTracking().Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }

    public async Task<IReadOnlyList<Notification>> ListByFilterAsync(Expression<Func<Notification, bool>> predicate,
        QueryOptions<Notification>? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new();
        return await db.Notifications.AsNoTracking().Where(predicate).OrderByDescending(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id).Take(options.BoundedLimit).ToListAsync(cancellationToken);
    }

    public async Task<NotificationId> CreateAsync(Notification entity, CancellationToken cancellationToken = default)
    {
        try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); return entity.Id; }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { db.ChangeTracker.Clear(); throw new PersistenceConflictException("notifications.conflict", "Bildirim zaten var.", exception); }
    }

    public async Task<bool> UpdateAsync(Expression<Func<Notification, bool>> predicate, Notification replacement,
        long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = db.Notifications.Where(predicate);
        if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value);
        var current = await query.SingleOrDefaultAsync(cancellationToken); if (current is null) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        try { return await db.SaveChangesAsync(cancellationToken) > 0; }
        catch (DbUpdateConcurrencyException) { return false; }
        finally { db.ChangeTracker.Clear(); }
    }

    public async Task<long> DeleteByFilterAsync(Expression<Func<Notification, bool>> predicate, CancellationToken cancellationToken = default) =>
        await db.Notifications.Where(predicate).ExecuteDeleteAsync(cancellationToken);

    public Task<Notification?> FindUnreadAggregationAsync(NotificationRecipientId recipientId, string aggregationKey,
        CancellationToken cancellationToken = default) => db.Notifications.AsNoTracking()
        .Where(x => x.RecipientId == recipientId && x.AggregationKey == aggregationKey && x.ReadAtUtc == null)
        .OrderByDescending(x => x.UpdatedAtUtc).FirstOrDefaultAsync(cancellationToken);

    public Task<Notification?> FindByIdempotencyKeyAsync(NotificationRecipientId recipientId, string idempotencyKey,
        CancellationToken cancellationToken = default) => db.Notifications.AsNoTracking()
        .SingleOrDefaultAsync(x => x.RecipientId == recipientId && x.IdempotencyKey == idempotencyKey, cancellationToken);

    public async Task<IReadOnlyList<Notification>> ListPageAsync(NotificationPageQuery request, CancellationToken cancellationToken = default)
    {
        var limit = Math.Clamp(request.Limit, 1, 100); var recipientId = request.RecipientId.Value;
        var query = request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue
            ? db.Notifications.FromSqlInterpolated($"""
                SELECT * FROM notifications.inbox WHERE "RecipientId" = {recipientId}
                  AND ("CreatedAtUtc" < {request.CursorCreatedAtUtc.Value}
                       OR ("CreatedAtUtc" = {request.CursorCreatedAtUtc.Value} AND "Id" > {request.CursorId.Value.Value}))
                ORDER BY "CreatedAtUtc" DESC, "Id" ASC LIMIT {limit}
                """)
            : db.Notifications.FromSqlInterpolated($"""
                SELECT * FROM notifications.inbox WHERE "RecipientId" = {recipientId}
                ORDER BY "CreatedAtUtc" DESC, "Id" ASC LIMIT {limit}
                """);
        return await query.AsNoTracking().ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Notification>> ListDueDeliveriesAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default) => await db.Notifications.AsNoTracking()
        .Where(x => x.DeliveryState == NotificationDeliveryState.Pending ||
                    x.DeliveryState == NotificationDeliveryState.RetryScheduled && x.NextAttemptAtUtc <= now)
        .OrderBy(x => x.NextAttemptAtUtc).ThenBy(x => x.CreatedAtUtc).Take(Math.Clamp(limit, 1, 100))
        .ToListAsync(cancellationToken);
}
