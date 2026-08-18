using ZosyalMedya.BuildingBlocks.Application.Persistence;using ZosyalMedya.Modules.Reactions.Domain.Reactions;
namespace ZosyalMedya.Modules.Reactions.Application.Ports;
public interface IReactionRepository:IRepository<Reaction,ReactionId>{Task<IReadOnlyDictionary<ReactionKind,long>> CountActiveByContentAsync(ReactedContentId contentId,CancellationToken cancellationToken=default);}
