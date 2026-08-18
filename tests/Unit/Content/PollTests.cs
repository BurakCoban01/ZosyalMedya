using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Posts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Content;

public sealed class PollTests
{
    [Fact]
    public void PollProtectsOptionsClosingAndSingleChoice()
    {
        var now = DateTimeOffset.UtcNow;
        var poll = Poll.Create(PollId.New(), PostId.New(), new(Guid.NewGuid()), "Hangisi?", ["Bir", "İki"], false, now.AddHours(1), now);
        poll.RegisterVote(new HashSet<PollOptionId> { poll.Options[0].Id }, now.AddMinutes(1));
        Assert.Equal(1, poll.Options[0].VoteCount);
        Assert.Equal("poll.options_invalid", Assert.Throws<DomainRuleException>(() =>
            poll.RegisterVote(poll.Options.Select(x => x.Id).ToHashSet(), now.AddMinutes(2))).Code);
        Assert.Equal("poll.closed", Assert.Throws<DomainRuleException>(() =>
            poll.RegisterVote(new HashSet<PollOptionId> { poll.Options[1].Id }, now.AddHours(1))).Code);
    }
}
