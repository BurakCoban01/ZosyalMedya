namespace ZosyalMedya.Modules.Reactions.Contracts;
public sealed record ReactionSummary(Guid ContentId,IReadOnlyDictionary<string,long> Counts,string? ViewerReaction);
public interface IReactionsModule{Task<ReactionSummary> GetSummaryAsync(Guid contentId,Guid? viewerId,CancellationToken cancellationToken=default);}
