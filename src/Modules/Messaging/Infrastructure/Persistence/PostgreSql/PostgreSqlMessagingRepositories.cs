using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlConversationRepository(MessagingDbContext db) : IConversationRepository
{
    public async Task<Conversation?> SelectAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await db.Conversations.AsNoTracking().Include("_members").Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Conversation>> ListByFilterAsync(Expression<Func<Conversation, bool>> predicate, QueryOptions<Conversation>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await db.Conversations.AsNoTracking().Include("_members").Where(predicate).OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id).Take(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<ConversationId> CreateAsync(Conversation entity, CancellationToken cancellationToken = default)
    { try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); return entity.Id; } catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { db.ChangeTracker.Clear(); throw new PersistenceConflictException("messaging.conversation_conflict", "Konuşma zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Conversation, bool>> predicate, Conversation replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = db.Conversations.Include("_members").Where(predicate); if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value);
        var current = await query.SingleOrDefaultAsync(cancellationToken); if (current is null) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        try { return await db.SaveChangesAsync(cancellationToken) > 0; } catch (DbUpdateConcurrencyException) { return false; } finally { db.ChangeTracker.Clear(); }
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Conversation, bool>> predicate, CancellationToken cancellationToken = default) => await db.Conversations.Where(predicate).ExecuteDeleteAsync(cancellationToken);
    public async Task<Conversation?> FindDirectAsync(ConversationMemberId first, ConversationMemberId second, CancellationToken cancellationToken = default)
    {
        var candidates = await db.Conversations.AsNoTracking().Include("_members").Where(x => x.Kind == ConversationKind.Direct).ToListAsync(cancellationToken);
        return candidates.SingleOrDefault(x => x.HasActiveMember(first) && x.HasActiveMember(second));
    }
    public async Task<IReadOnlyList<Conversation>> ListForMemberAsync(ConversationListQuery request, CancellationToken cancellationToken = default)
    {
        var limit = Math.Clamp(request.Limit, 1, 50); var memberId = request.MemberId.Value;
        var query = request.CursorUpdatedAtUtc.HasValue && request.CursorId.HasValue
            ? db.Conversations.FromSqlInterpolated($"""
                SELECT c.* FROM messaging.conversations c
                WHERE EXISTS (SELECT 1 FROM messaging.conversation_members cm
                    WHERE cm."ConversationId" = c."Id" AND cm."UserId" = {memberId} AND cm."LeftAtUtc" IS NULL)
                  AND (c."UpdatedAtUtc" < {request.CursorUpdatedAtUtc.Value}
                       OR (c."UpdatedAtUtc" = {request.CursorUpdatedAtUtc.Value} AND c."Id" > {request.CursorId.Value.Value}))
                ORDER BY c."UpdatedAtUtc" DESC, c."Id" ASC LIMIT {limit}
                """)
            : db.Conversations.FromSqlInterpolated($"""
                SELECT c.* FROM messaging.conversations c
                WHERE EXISTS (SELECT 1 FROM messaging.conversation_members cm
                    WHERE cm."ConversationId" = c."Id" AND cm."UserId" = {memberId} AND cm."LeftAtUtc" IS NULL)
                ORDER BY c."UpdatedAtUtc" DESC, c."Id" ASC LIMIT {limit}
                """);
        return await query.AsNoTracking().Include("_members").ToListAsync(cancellationToken);
    }
}

public sealed class PostgreSqlMessageRepository(MessagingDbContext db) : IMessageRepository
{
    public async Task<Message?> SelectAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default)
    { var items = await db.Messages.AsNoTracking().Include("_receipts").Where(predicate).OrderBy(x => x.Id).Take(2).ToListAsync(cancellationToken); return items.SingleOrDefault(); }
    public async Task<IReadOnlyList<Message>> ListByFilterAsync(Expression<Func<Message, bool>> predicate, QueryOptions<Message>? options = null, CancellationToken cancellationToken = default)
    { options ??= new(); return await db.Messages.AsNoTracking().Include("_receipts").Where(predicate).OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).Take(options.BoundedLimit).ToListAsync(cancellationToken); }
    public async Task<MessageId> CreateAsync(Message entity, CancellationToken cancellationToken = default)
    { try { db.Add(entity); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); return entity.Id; } catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { db.ChangeTracker.Clear(); throw new PersistenceConflictException("messaging.message_conflict", "Mesaj zaten var.", exception); } }
    public async Task<bool> UpdateAsync(Expression<Func<Message, bool>> predicate, Message replacement, long? expectedVersion = null, CancellationToken cancellationToken = default)
    {
        var query = db.Messages.Include("_receipts").Where(predicate); if (expectedVersion.HasValue) query = query.Where(x => x.Version == expectedVersion.Value);
        var current = await query.SingleOrDefaultAsync(cancellationToken); if (current is null) return false;
        db.Entry(current).CurrentValues.SetValues(replacement);
        var receiptCollection = db.Entry(current).Collection("_receipts");
        var currentReceipts = (ICollection<MessageReceipt>)receiptCollection.CurrentValue!;
        foreach (var replacementReceipt in replacement.Receipts)
        {
            var receipt = currentReceipts.Single(x => x.UserId == replacementReceipt.UserId);
            db.Entry(receipt).CurrentValues.SetValues(replacementReceipt);
        }
        try { return await db.SaveChangesAsync(cancellationToken) > 0; } catch (DbUpdateConcurrencyException) { return false; } finally { db.ChangeTracker.Clear(); }
    }
    public async Task<long> DeleteByFilterAsync(Expression<Func<Message, bool>> predicate, CancellationToken cancellationToken = default) => await db.Messages.Where(predicate).ExecuteDeleteAsync(cancellationToken);
    public async Task<IReadOnlyList<Message>> ListPageAsync(MessagePageQuery request, CancellationToken cancellationToken = default)
    {
        var limit = Math.Clamp(request.Limit, 1, 100); var conversationId = request.ConversationId.Value;
        var query = request.CursorCreatedAtUtc.HasValue && request.CursorId.HasValue
            ? db.Messages.FromSqlInterpolated($"""
                SELECT * FROM messaging.messages
                WHERE "ConversationId" = {conversationId}
                  AND ("CreatedAtUtc" < {request.CursorCreatedAtUtc.Value}
                       OR ("CreatedAtUtc" = {request.CursorCreatedAtUtc.Value} AND "Id" > {request.CursorId.Value.Value}))
                ORDER BY "CreatedAtUtc" DESC, "Id" ASC LIMIT {limit}
                """)
            : db.Messages.FromSqlInterpolated($"""
                SELECT * FROM messaging.messages WHERE "ConversationId" = {conversationId}
                ORDER BY "CreatedAtUtc" DESC, "Id" ASC LIMIT {limit}
                """);
        return await query.AsNoTracking().Include("_receipts").ToListAsync(cancellationToken);
    }
    public Task<long> CountUnreadAsync(ConversationId conversationId, Guid userId, CancellationToken cancellationToken = default) =>
        db.Messages.LongCountAsync(x => x.ConversationId == conversationId && EF.Property<ICollection<MessageReceipt>>(x, "_receipts").Any(r => r.UserId == userId && r.ReadAtUtc == null), cancellationToken);
    public async Task<bool> CanMemberAccessMediaAsync(Guid mediaId, Guid memberId, CancellationToken cancellationToken = default)
    {
        return await db.Database.SqlQuery<int>($"""
            SELECT 1 AS "Value"
            FROM messaging.messages AS message
            INNER JOIN messaging.conversation_members AS member
              ON member."ConversationId" = message."ConversationId"
            WHERE message."Status" = 'Sent'
              AND {mediaId} = ANY(message."MediaIds")
              AND member."UserId" = {memberId}
              AND member."LeftAtUtc" IS NULL
            LIMIT 1
            """).AnyAsync(cancellationToken);
    }
}
