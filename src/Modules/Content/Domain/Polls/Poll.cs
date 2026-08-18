using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Domain.Polls;

public readonly record struct PollId(Guid Value) { public static PollId New() => new(Guid.NewGuid()); }
public readonly record struct PollOptionId(Guid Value) { public static PollOptionId New() => new(Guid.NewGuid()); }

public sealed class PollOption
{
    private PollOption() { Text = string.Empty; }
    internal PollOption(PollOptionId id, string text) { Id = id; Text = text; }
    public PollOptionId Id { get; private set; }
    public string Text { get; private set; }
    public long VoteCount { get; private set; }
    internal void Increment() => VoteCount++;
}

public sealed class Poll : AggregateRoot<PollId>
{
    private List<PollOption> _options = [];
    private Poll() : base(default) { Question = string.Empty; }
    private Poll(PollId id, PostId postId, ContentAuthorId authorId, string question,
        IEnumerable<string> options, bool allowMultiple, DateTimeOffset closesAtUtc, DateTimeOffset now) : base(id)
    {
        if (postId.Value == Guid.Empty || authorId.Value == Guid.Empty)
            throw new DomainRuleException("poll.reference_invalid", "Anket içerik ve yazar gerektirir.");
        Question = Require(question, 240, "poll.question_invalid");
        var cleanOptions = options.Select(x => Require(x, 120, "poll.option_invalid"))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (cleanOptions.Length is < 2 or > 6)
            throw new DomainRuleException("poll.option_count_invalid", "Anket 2-6 benzersiz seçenek içermelidir.");
        if (closesAtUtc <= now || closesAtUtc > now.AddDays(30))
            throw new DomainRuleException("poll.close_time_invalid", "Anket 30 gün içinde gelecekte kapanmalıdır.");
        PostId = postId; AuthorId = authorId; AllowMultiple = allowMultiple; ClosesAtUtc = closesAtUtc;
        CreatedAtUtc = now; _options.AddRange(cleanOptions.Select(x => new PollOption(PollOptionId.New(), x))); Version = 1;
    }

    public PostId PostId { get; private set; }
    public ContentAuthorId AuthorId { get; private set; }
    public string Question { get; private set; }
    public bool AllowMultiple { get; private set; }
    public DateTimeOffset ClosesAtUtc { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public IReadOnlyList<PollOption> Options => _options.AsReadOnly();
    public bool IsOpen(DateTimeOffset now) => now < ClosesAtUtc;
    public void RegisterVote(IReadOnlySet<PollOptionId> optionIds, DateTimeOffset now)
    {
        if (!IsOpen(now)) throw new DomainRuleException("poll.closed", "Anket kapanmış.");
        if (optionIds.Count == 0 || (!AllowMultiple && optionIds.Count != 1) ||
            optionIds.Any(id => _options.All(option => option.Id != id)))
            throw new DomainRuleException("poll.options_invalid", "Anket seçenekleri geçersiz.");
        foreach (var option in _options.Where(x => optionIds.Contains(x.Id))) option.Increment();
        Version++;
    }
    public static Poll Create(PollId id, PostId postId, ContentAuthorId authorId, string question,
        IEnumerable<string> options, bool allowMultiple, DateTimeOffset closesAtUtc, DateTimeOffset now) =>
        new(id, postId, authorId, question, options, allowMultiple, closesAtUtc, now);
    private static string Require(string value, int max, string code)
    { var clean = value.Trim(); if (clean.Length is 0 || clean.Length > max) throw new DomainRuleException(code, "Anket alanı geçersiz."); return clean; }
}

public enum PollVoteOutcome { Accepted, PollNotFound, Closed, InvalidOptions, AlreadyVoted }
