using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Application.Polls;

public sealed record PollOptionView(Guid Id, string Text, long VoteCount);
public sealed record PollView(Guid Id, Guid PostId, string Question, bool AllowMultiple, DateTimeOffset ClosesAtUtc,
    bool IsOpen, IReadOnlyList<PollOptionView> Options, long TotalVotes);

public sealed class CreatePollHandler(IPostRepository posts, IPollRepository polls, IClock clock, ICacheService cache)
{
    public async Task<Result<PollView>> HandleAsync(Guid postId, Guid actorId, string question,
        IReadOnlyList<string> options, bool allowMultiple, DateTimeOffset closesAtUtc, CancellationToken token)
    {
        var post = await posts.SelectAsync(x => x.Id == new PostId(postId), token);
        if (post is null) return Result.Failure<PollView>("content.not_found", "İçerik bulunamadı.");
        if (post.AuthorId.Value != actorId) return Result.Failure<PollView>("content.forbidden", "Anketi yalnız içerik yazarı ekleyebilir.");
        if (post.Status is PostStatus.Deleted or PostStatus.Archived)
            return Result.Failure<PollView>("poll.post_invalid", "Silinmiş veya arşivlenmiş içeriğe anket eklenemez.");
        if (await polls.GetByPostAsync(post.Id, token) is not null)
            return Result.Failure<PollView>("poll.already_exists", "İçeriğin zaten anketi var.");
        try
        {
            var poll = Poll.Create(PollId.New(), post.Id, post.AuthorId, question, options, allowMultiple, closesAtUtc, clock.UtcNow);
            await polls.CreateAsync(poll, token);
            await FeedCacheGeneration.AdvanceAsync(cache, token);
            return Result.Success(Map(poll, clock.UtcNow));
        }
        catch (DomainRuleException exception) { return Result.Failure<PollView>(exception.Code, exception.Message); }
    }

    internal static PollView Map(Poll poll, DateTimeOffset now) => new(poll.Id.Value, poll.PostId.Value, poll.Question,
        poll.AllowMultiple, poll.ClosesAtUtc, poll.IsOpen(now), poll.Options.Select(x => new PollOptionView(x.Id.Value, x.Text, x.VoteCount)).ToArray(),
        poll.Options.Sum(x => x.VoteCount));
}

public sealed class VotePollHandler(IPollRepository polls, IContentModule content, IClock clock)
{
    public async Task<Result<PollView>> HandleAsync(Guid postId, Guid actorId, IReadOnlySet<Guid> optionIds, CancellationToken token)
    {
        if (await content.GetVisibleAsync(postId, actorId, token) is null)
            return Result.Failure<PollView>("content.not_found", "İçerik bulunamadı veya görünür değil.");
        var poll = await polls.GetByPostAsync(new PostId(postId), token);
        if (poll is null) return Result.Failure<PollView>("poll.not_found", "Anket bulunamadı.");
        var outcome = await polls.CastVoteAsync(poll.Id, actorId, optionIds.Select(x => new PollOptionId(x)).ToHashSet(), clock.UtcNow, token);
        if (outcome != PollVoteOutcome.Accepted)
        {
            var code = outcome switch { PollVoteOutcome.Closed => "poll.closed", PollVoteOutcome.InvalidOptions => "poll.options_invalid", PollVoteOutcome.AlreadyVoted => "poll.already_voted", _ => "poll.not_found" };
            return Result.Failure<PollView>(code, "Anket oyu kabul edilmedi.");
        }
        return Result.Success(CreatePollHandler.Map((await polls.GetByPostAsync(new PostId(postId), token))!, clock.UtcNow));
    }
}

public sealed class GetPollHandler(IPollRepository polls, IContentModule content, IClock clock)
{
    public async Task<Result<PollView>> HandleAsync(Guid postId, Guid? viewerId, CancellationToken token)
    {
        if (await content.GetVisibleAsync(postId, viewerId, token) is null)
            return Result.Failure<PollView>("content.not_found", "İçerik bulunamadı veya görünür değil.");
        var poll = await polls.GetByPostAsync(new PostId(postId), token);
        return poll is null ? Result.Failure<PollView>("poll.not_found", "Anket bulunamadı.") : Result.Success(CreatePollHandler.Map(poll, clock.UtcNow));
    }
}
