namespace ZosyalMedya.Modules.Feed.Domain.Ranking;
public sealed record RankingSignals(DateTimeOffset PublishedAtUtc,long ReactionCount,long CommentCount,bool IsFollowing,bool IsCloseFriend);
public sealed record RankingResult(double Score,IReadOnlyList<string>Reasons);
public interface IRankingPolicy{RankingResult Rank(RankingSignals signals,DateTimeOffset now);}
public sealed class DeterministicRankingPolicy:IRankingPolicy
{public RankingResult Rank(RankingSignals signals,DateTimeOffset now){var ageHours=Math.Max(0,(now-signals.PublishedAtUtc).TotalHours);var recency=100d/(1d+ageHours/6d);var relationship=signals.IsCloseFriend?30:signals.IsFollowing?15:0;var engagement=Math.Log10(1+signals.ReactionCount*2+signals.CommentCount*3)*12;var reasons=new List<string>{$"recency:{recency:F2}",$"relationship:{relationship:F2}",$"engagement:{engagement:F2}"};return new(Math.Round(recency+relationship+engagement,4),reasons);}}
