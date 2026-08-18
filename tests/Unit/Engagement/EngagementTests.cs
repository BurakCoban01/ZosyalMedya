using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Comments.Domain.Comments;
using ZosyalMedya.Modules.Feed.Domain.Ranking;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Engagement;
public sealed class EngagementTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 10, 0, 0, TimeSpan.Zero);
    [Fact] public void ReactionSetAndRemoveAreIdempotent() { var reaction = Reaction.Create(ReactionId.New(), new(Guid.NewGuid()), new(Guid.NewGuid()), ReactionKind.Like, Now); Assert.False(reaction.Set(ReactionKind.Like, Now)); Assert.True(reaction.Set(ReactionKind.Love, Now)); Assert.False(reaction.Set(ReactionKind.Love, Now)); Assert.True(reaction.Remove(Now)); Assert.False(reaction.Remove(Now)); }
    [Fact] public void CommentDepthAndAuthorRulesAreEnforced() { Assert.Throws<DomainRuleException>(() => Comment.Create(CommentId.New(), new(Guid.NewGuid()), new(Guid.NewGuid()), CommentId.New(), 6, "çok derin", Now)); var author = new CommentAuthorId(Guid.NewGuid()); var comment = Comment.Create(CommentId.New(), author, new(Guid.NewGuid()), null, 0, "Merhaba @deneme", Now); Assert.Single(comment.Mentions); Assert.Throws<DomainRuleException>(() => comment.Edit(new(Guid.NewGuid()), "yetkisiz", Now)); comment.Delete(author, Now); Assert.Equal(CommentStatus.Deleted, comment.Status); }
    [Fact] public void RankingIsDeterministicAndExplainable() { var policy = new DeterministicRankingPolicy(); var signals = new RankingSignals(Now.AddHours(-2), 12, 4, true, false); var first = policy.Rank(signals, Now); var second = policy.Rank(signals, Now); Assert.Equal(first.Score, second.Score); Assert.Equal(first.Reasons, second.Reasons); Assert.Equal(3, first.Reasons.Count); Assert.True(first.Score > 0); }
}
