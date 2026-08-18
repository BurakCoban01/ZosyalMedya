using Microsoft.EntityFrameworkCore;
using Npgsql;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;

public sealed class PostgreSqlPollRepository(ContentDbContext db) : IPollRepository
{
    public Task<Poll?> GetByPostAsync(PostId postId, CancellationToken cancellationToken = default) =>
        db.Polls.AsNoTracking().Include("_options").SingleOrDefaultAsync(x => x.PostId == postId, cancellationToken);

    public async Task<IReadOnlySet<PostId>> ListExistingPostIdsAsync(IReadOnlySet<PostId> postIds,
        CancellationToken cancellationToken = default)
    {
        if (postIds.Count == 0) return new HashSet<PostId>();
        return (await db.Polls.AsNoTracking()
            .Where(x => postIds.Contains(x.PostId))
            .Select(x => x.PostId)
            .ToListAsync(cancellationToken))
            .ToHashSet();
    }

    public async Task CreateAsync(Poll poll, CancellationToken cancellationToken = default)
    { db.Polls.Add(poll); await db.SaveChangesAsync(cancellationToken); db.ChangeTracker.Clear(); }

    public async Task<PollVoteOutcome> CastVoteAsync(PollId pollId, Guid actorId, IReadOnlySet<PollOptionId> optionIds,
        DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var poll = await db.Polls.Include("_options").SingleOrDefaultAsync(x => x.Id == pollId, cancellationToken);
        if (poll is null) return PollVoteOutcome.PollNotFound;
        try { poll.RegisterVote(optionIds, now); }
        catch (ZosyalMedya.BuildingBlocks.Domain.DomainRuleException exception)
        { return exception.Code == "poll.closed" ? PollVoteOutcome.Closed : PollVoteOutcome.InvalidOptions; }
        db.PollBallots.Add(new PollBallot(pollId, actorId, optionIds, now));
        try { await db.SaveChangesAsync(cancellationToken); await transaction.CommitAsync(cancellationToken); db.ChangeTracker.Clear(); return PollVoteOutcome.Accepted; }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { await transaction.RollbackAsync(cancellationToken); db.ChangeTracker.Clear(); return PollVoteOutcome.AlreadyVoted; }
    }
}
