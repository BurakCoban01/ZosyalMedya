namespace ZosyalMedya.Modules.Communities.Contracts;
public sealed record CommunityAccess(Guid CommunityId,bool CanView,bool CanPublish,bool CanModerate,string?Role);
public interface ICommunitiesModule{Task<CommunityAccess>GetAccessAsync(Guid communityId,Guid?actorId,CancellationToken cancellationToken=default);}
