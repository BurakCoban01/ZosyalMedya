using ZosyalMedya.BuildingBlocks.Domain;
namespace ZosyalMedya.Modules.Reactions.Domain.Reactions;
public readonly record struct ReactionId(Guid Value){public static ReactionId New()=>new(Guid.NewGuid());}
public readonly record struct ReactionActorId(Guid Value);
public readonly record struct ReactedContentId(Guid Value);
public enum ReactionKind{Like,Love,Insightful,Support,Laugh}
public sealed class Reaction:AggregateRoot<ReactionId>
{
    private Reaction():base(default){}
    private Reaction(ReactionId id,ReactionActorId actorId,ReactedContentId contentId,ReactionKind kind,DateTimeOffset now):base(id){ActorId=actorId;ContentId=contentId;Kind=kind;IsActive=true;CreatedAtUtc=now;UpdatedAtUtc=now;Version=1;}
    public ReactionActorId ActorId{get;private set;}public ReactedContentId ContentId{get;private set;}public ReactionKind Kind{get;private set;}public bool IsActive{get;private set;}public DateTimeOffset CreatedAtUtc{get;private set;}public DateTimeOffset UpdatedAtUtc{get;private set;}
    public static Reaction Create(ReactionId id,ReactionActorId actorId,ReactedContentId contentId,ReactionKind kind,DateTimeOffset now){if(actorId.Value==Guid.Empty||contentId.Value==Guid.Empty)throw new DomainRuleException("reactions.reference_invalid","Aktör ve içerik gereklidir.");return new(id,actorId,contentId,kind,now);}
    public bool Set(ReactionKind kind,DateTimeOffset now){if(IsActive&&Kind==kind)return false;Kind=kind;IsActive=true;UpdatedAtUtc=now;Version++;return true;}
    public bool Remove(DateTimeOffset now){if(!IsActive)return false;IsActive=false;UpdatedAtUtc=now;Version++;return true;}
}
