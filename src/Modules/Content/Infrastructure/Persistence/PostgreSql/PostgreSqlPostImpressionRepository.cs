using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlPostImpressionRepository(ContentDbContext db, TimeProvider timeProvider) : IPostImpressionRepository
{
    public async Task<bool> RecordUniqueAsync(PostId postId, string viewerHash, DateOnly utcDay,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        db.PostImpressions.Add(new PostImpression(postId, viewerHash, utcDay, timeProvider.GetUtcNow()));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await db.Posts.Where(x => x.Id == postId).ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.ViewCount, x => x.ViewCount + 1), cancellationToken);
            await transaction.CommitAsync(cancellationToken); db.ChangeTracker.Clear(); return true;
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { await transaction.RollbackAsync(cancellationToken); db.ChangeTracker.Clear(); return false; }
    }
}
