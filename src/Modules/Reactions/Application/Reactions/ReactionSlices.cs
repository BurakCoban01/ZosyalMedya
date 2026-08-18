using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Reactions.Application.Ports;
using ZosyalMedya.Modules.Reactions.Contracts;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;

namespace ZosyalMedya.Modules.Reactions.Application.Reactions;

public sealed record ReactionView(Guid ContentId, string? Reaction, bool IsActive, long Version);

public sealed class SetReactionHandler(IReactionRepository reactions, IContentModule content, IClock clock, ICacheService cache)
{
    public async Task<Result<ReactionView>> HandleAsync(Guid contentId, Guid actorId, ReactionKind? kind, CancellationToken cancellationToken)
    {
        if (!await content.CanEngageAsync(contentId, actorId, cancellationToken))
            return Result.Failure<ReactionView>("reactions.content_unavailable", "İçerik etkileşime açık değil.");
        var actor = new ReactionActorId(actorId); var reference = new ReactedContentId(contentId);
        var reaction = await reactions.SelectAsync(x => x.ActorId == actor && x.ContentId == reference, cancellationToken);
        if (reaction is null)
        {
            if (!kind.HasValue) return Result.Success<ReactionView>(new(contentId, null, false, 0));
            reaction = Reaction.Create(ReactionId.New(), actor, reference, kind.Value, clock.UtcNow);
            try { await reactions.CreateAsync(reaction, cancellationToken); }
            catch (BuildingBlocks.Application.Persistence.PersistenceConflictException)
            {
                reaction = await reactions.SelectAsync(x => x.ActorId == actor && x.ContentId == reference, cancellationToken);
                if (reaction is null) return Result.Failure<ReactionView>("reactions.concurrency_conflict", "Tepki eşzamanlı değiştirildi.");
            }
            await InvalidateFeedAsync(cancellationToken); return Result.Success(Map(reaction));
        }
        var version = reaction.Version; var changed = kind.HasValue ? reaction.Set(kind.Value, clock.UtcNow) : reaction.Remove(clock.UtcNow);
        if (!changed) return Result.Success(Map(reaction));
        if (!await reactions.UpdateAsync(x => x.Id == reaction.Id, reaction, version, cancellationToken)) return Result.Failure<ReactionView>("reactions.concurrency_conflict", "Tepki eşzamanlı değiştirildi.");
        await InvalidateFeedAsync(cancellationToken); return Result.Success(Map(reaction));
    }
    private static ReactionView Map(Reaction reaction) => new(reaction.ContentId.Value,
        reaction.IsActive ? reaction.Kind.ToString() : null, reaction.IsActive, reaction.Version);
    private Task InvalidateFeedAsync(CancellationToken token) => cache.SetAsync("feed:generation", Guid.NewGuid().ToString("N"), TimeSpan.FromDays(7), token);
}

public sealed class ReactionsModule(IReactionRepository reactions) : IReactionsModule
{
    public async Task<ReactionSummary> GetSummaryAsync(Guid contentId, Guid? viewerId, CancellationToken cancellationToken = default)
    {
        var id = new ReactedContentId(contentId); var counts = await reactions.CountActiveByContentAsync(id, cancellationToken); string? viewer = null;
        if (viewerId.HasValue)
        {
            var item = await reactions.SelectAsync(x => x.ContentId == id && x.ActorId == new ReactionActorId(viewerId.Value), cancellationToken);
            if (item?.IsActive == true) viewer = item.Kind.ToString();
        }
        return new(contentId, counts.ToDictionary(x => x.Key.ToString(), x => x.Value), viewer);
    }
}
