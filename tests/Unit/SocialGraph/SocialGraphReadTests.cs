using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Application.Relationships;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using Xunit;

namespace ZosyalMedya.Tests.Unit.SocialGraph;

public sealed class SocialGraphReadTests
{
    [Fact]
    public async Task SummaryCountsRealStatesAndOnlyOwnerSeesPendingCount()
    {
        var owner=Guid.NewGuid();var follower=Guid.NewGuid();var following=Guid.NewGuid();var requester=Guid.NewGuid();
        var repository=new StubRepository([
            Edge(follower,owner,FollowState.Following),Edge(owner,following,FollowState.Following),Edge(requester,owner,FollowState.Pending)]);
        var profiles=new ProfilesStub([Profile(owner,false),Profile(follower,false),Profile(following,false),Profile(requester,false)]);
        var handler=new SocialGraphReadHandler(repository,profiles);

        var own=await handler.SummaryAsync(new(owner),new(owner),default);
        var publicView=await handler.SummaryAsync(new(follower),new(owner),default);

        Assert.True(own.IsSuccess);Assert.Equal((1,1,1),(own.Value!.FollowerCount,own.Value.FollowingCount,own.Value.PendingRequestCount));
        Assert.True(publicView.IsSuccess);Assert.Equal(0,publicView.Value!.PendingRequestCount);Assert.False(publicView.Value.CanManageRequests);
    }

    [Fact]
    public async Task PrivateGraphRequiresFollowingAndProfilesLoadInOneBatch()
    {
        var owner=Guid.NewGuid();var viewer=Guid.NewGuid();var follower=Guid.NewGuid();
        var repository=new StubRepository([Edge(follower,owner,FollowState.Following)]);
        var profiles=new ProfilesStub([Profile(owner,true),Profile(follower,false)]);
        var handler=new SocialGraphReadHandler(repository,profiles);

        var denied=await handler.ListAsync(new(viewer),new(owner),SocialGraphListKind.Followers,20,null,default);
        repository.Items.Add(Edge(viewer,owner,FollowState.Following));
        var allowed=await handler.ListAsync(new(viewer),new(owner),SocialGraphListKind.Followers,20,null,default);

        Assert.False(denied.IsSuccess);Assert.Equal("social_graph.not_visible",denied.Error.Code);
        Assert.True(allowed.IsSuccess);Assert.Single(allowed.Value!.Items);Assert.Equal(1,profiles.BatchCalls);
    }

    [Fact]
    public async Task RejectOnlyRemovesAnIncomingPendingRequest()
    {
        var owner=Guid.NewGuid();var requester=Guid.NewGuid();var relationship=Edge(requester,owner,FollowState.Pending);
        var repository=new StubRepository([relationship]);var handler=new RejectFollowHandler(repository,new Clock());
        var result=await handler.HandleAsync(new(owner),new(requester),default);
        Assert.True(result.IsSuccess);Assert.Equal(FollowState.None,result.Value!.FollowState);Assert.Equal(FollowState.None,relationship.FollowState);
    }

    [Fact]
    public async Task FollowPublishesOneActionablePendingRequestNotification()
    {
        var owner=Guid.NewGuid();var requester=Guid.NewGuid();var repository=new StubRepository([]);
        var profiles=new ProfilesStub([Profile(owner,true),Profile(requester,false)]);
        var handler=new FollowHandler(repository,profiles,new Clock());

        var first=await handler.HandleAsync(new(requester),new(owner),default);
        var repeated=await handler.HandleAsync(new(requester),new(owner),default);

        Assert.True(first.IsSuccess);Assert.Equal(FollowState.Pending,first.Value!.FollowState);Assert.True(repeated.IsSuccess);
        var notice=Assert.IsType<FollowStartedIntegrationEvent>(Assert.Single(repository.Items.Single().DomainEvents));
        Assert.Equal((requester,owner,true),(notice.ActorId,notice.RecipientId,notice.RequiresApproval));
    }

    [Fact]
    public async Task FollowNotificationEligibilityRejectsStaleOrBlockedRelationships()
    {
        var owner=Guid.NewGuid();var requester=Guid.NewGuid();var relationship=Edge(requester,owner,FollowState.Pending);
        var repository=new StubRepository([relationship]);var module=new SocialGraphModule(repository);
        Assert.True(await module.IsFollowNotificationCurrentAsync(relationship.Id.Value,requester,owner,relationship.Version,true));
        Assert.False(await module.IsFollowNotificationCurrentAsync(relationship.Id.Value,requester,owner,relationship.Version+1,true));
        var reverse=Relationship.Create(RelationshipId.New(),new(owner),new(requester),DateTimeOffset.UtcNow);reverse.Block(DateTimeOffset.UtcNow);repository.Items.Add(reverse);
        Assert.False(await module.IsFollowNotificationCurrentAsync(relationship.Id.Value,requester,owner,relationship.Version,true));
    }

    [Fact]
    public async Task OversizedCursorIsRejectedBeforeRepositoryPaging()
    {
        var owner=Guid.NewGuid();var repository=new StubRepository([]);var handler=new SocialGraphReadHandler(repository,new ProfilesStub([Profile(owner,false)]));
        var cursor=Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("10001"));
        await Assert.ThrowsAsync<DomainRuleException>(()=>handler.ListAsync(new(owner),new(owner),SocialGraphListKind.Followers,20,cursor,default));
        Assert.Equal(0,repository.PageCalls);
    }

    private static Relationship Edge(Guid actor,Guid target,FollowState state){var value=Relationship.Create(RelationshipId.New(),new(actor),new(target),DateTimeOffset.UtcNow);if(state!=FollowState.None)value.RequestFollow(state==FollowState.Pending,DateTimeOffset.UtcNow);return value;}
    private static ProfileLookup Profile(Guid id,bool isPrivate)=>new(id,$"u{id:N}"[..12],"Kullanıcı",isPrivate,null,false);
    private sealed class Clock:ZosyalMedya.BuildingBlocks.Domain.IClock{public DateTimeOffset UtcNow=>DateTimeOffset.UtcNow;}
    private sealed class ProfilesStub(IEnumerable<ProfileLookup> profiles):IProfilesModule
    {private readonly Dictionary<Guid,ProfileLookup> map=profiles.ToDictionary(x=>x.OwnerId);public int BatchCalls{get;private set;}public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId,CancellationToken cancellationToken=default)=>Task.FromResult(map.GetValueOrDefault(ownerId));public Task<IReadOnlyDictionary<Guid,ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds,CancellationToken cancellationToken=default){BatchCalls++;return Task.FromResult<IReadOnlyDictionary<Guid,ProfileLookup>>(map.Where(x=>ownerIds.Contains(x.Key)).ToDictionary());}}
    private sealed class StubRepository(IEnumerable<Relationship> items):IRelationshipRepository
    {public List<Relationship> Items{get;}=[..items];public int PageCalls{get;private set;}public Task<long> CountAsync(GraphUserId ownerId,RelationshipReadKind kind,CancellationToken cancellationToken=default)=>Task.FromResult((long)Filter(ownerId,kind).Count());public Task<IReadOnlyList<Relationship>> ListPageAsync(RelationshipPageQuery query,CancellationToken cancellationToken=default){PageCalls++;return Task.FromResult<IReadOnlyList<Relationship>>(Filter(query.OwnerId,query.Kind).Skip(query.Offset).Take(query.Limit).ToArray());}private IEnumerable<Relationship> Filter(GraphUserId ownerId,RelationshipReadKind kind)=>kind switch{RelationshipReadKind.Followers=>Items.Where(x=>x.TargetId==ownerId&&x.FollowState==FollowState.Following&&!x.IsBlocked),RelationshipReadKind.Following=>Items.Where(x=>x.ActorId==ownerId&&x.FollowState==FollowState.Following&&!x.IsBlocked),_=>Items.Where(x=>x.TargetId==ownerId&&x.FollowState==FollowState.Pending&&!x.IsBlocked)};public Task<Relationship?> SelectAsync(Expression<Func<Relationship,bool>> predicate,CancellationToken cancellationToken=default)=>Task.FromResult(Items.AsQueryable().SingleOrDefault(predicate));public Task<IReadOnlyList<Relationship>> ListByFilterAsync(Expression<Func<Relationship,bool>> predicate,QueryOptions<Relationship>? options=null,CancellationToken cancellationToken=default)=>Task.FromResult<IReadOnlyList<Relationship>>(Items.AsQueryable().Where(predicate).Take(options?.BoundedLimit??50).ToArray());public Task<RelationshipId> CreateAsync(Relationship entity,CancellationToken cancellationToken=default){Items.Add(entity);return Task.FromResult(entity.Id);}public Task<bool> UpdateAsync(Expression<Func<Relationship,bool>> predicate,Relationship replacement,long? expectedVersion=null,CancellationToken cancellationToken=default)=>Task.FromResult(true);public Task<long> DeleteByFilterAsync(Expression<Func<Relationship,bool>> predicate,CancellationToken cancellationToken=default)=>throw new NotSupportedException();}
}
