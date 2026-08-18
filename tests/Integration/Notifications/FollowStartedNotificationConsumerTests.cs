using System.Text.Json;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Notifications.Contracts;
using ZosyalMedya.Modules.Notifications.Infrastructure.Delivery;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Notifications;

public sealed class FollowStartedNotificationConsumerTests
{
    [Fact]
    public async Task FailedDeliveryCanRetryTheDurableEventIntoTheRealRequestQueue()
    {
        var actor=Guid.NewGuid();var recipient=Guid.NewGuid();var relationship=Guid.NewGuid();
        var follow=new FollowStartedIntegrationEvent(relationship,actor,recipient,2,true,DateTimeOffset.UtcNow);
        var envelope=new IntegrationEventEnvelope(Guid.NewGuid(),$"{typeof(FollowStartedIntegrationEvent).FullName}:v1",
            JsonSerializer.Serialize(follow),"test",follow.OccurredAtUtc);
        var sink=new NotificationSink(failFirst:true);
        var consumer=new FollowStartedNotificationConsumer(sink,
            new ProfilesStub(new(actor,"ayse.dev","Ayse",false,null,false)),new SocialGraphStub(true));

        await Assert.ThrowsAsync<InvalidOperationException>(()=>consumer.HandleAsync(envelope));
        await consumer.HandleAsync(envelope);

        var notice=Assert.Single(sink.Items);Assert.Equal("NewFollower",notice.Type);
        Assert.Equal(actor,notice.EntityId);Assert.Equal("Pending",notice.Arguments["followState"]);
        Assert.Equal("ayse.dev",notice.Arguments["actorHandle"]);Assert.Equal("/baglantilar?view=requests",notice.DeepLink);
        Assert.Equal($"follow:{relationship:N}:2",notice.IdempotencyKey);
    }

    [Fact]
    public async Task ObsoleteFollowEventDoesNotDiscloseOrEnqueueActorContext()
    {
        var follow=new FollowStartedIntegrationEvent(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),2,true,DateTimeOffset.UtcNow);
        var envelope=new IntegrationEventEnvelope(Guid.NewGuid(),$"{typeof(FollowStartedIntegrationEvent).FullName}:v1",JsonSerializer.Serialize(follow),"test",follow.OccurredAtUtc);
        var sink=new NotificationSink(false);var profiles=new ProfilesStub(new(follow.ActorId,"hidden","Hidden",false,null,false));
        var consumer=new FollowStartedNotificationConsumer(sink,profiles,new SocialGraphStub(false));

        await consumer.HandleAsync(envelope);

        Assert.Empty(sink.Items);Assert.Equal(0,profiles.Calls);
    }

    [Fact]
    public async Task PrivateFollowerIdentityIsNotDisclosedByThePublicFollowNotification()
    {
        var follow=new FollowStartedIntegrationEvent(Guid.NewGuid(),Guid.NewGuid(),Guid.NewGuid(),2,false,DateTimeOffset.UtcNow);
        var envelope=new IntegrationEventEnvelope(Guid.NewGuid(),$"{typeof(FollowStartedIntegrationEvent).FullName}:v1",JsonSerializer.Serialize(follow),"test",follow.OccurredAtUtc);
        var sink=new NotificationSink(false);var consumer=new FollowStartedNotificationConsumer(sink,
            new ProfilesStub(new(follow.ActorId,"private.actor","Private Actor",true,null,false)),new SocialGraphStub(true));

        await consumer.HandleAsync(envelope);

        var notice=Assert.Single(sink.Items);Assert.Equal("/baglantilar",notice.DeepLink);
        Assert.DoesNotContain("actorHandle",notice.Arguments.Keys);Assert.DoesNotContain("actorName",notice.Arguments.Keys);
    }

    private sealed class NotificationSink(bool failFirst):INotificationsModule
    {private bool fail=failFirst;public List<EnqueueNotification>Items{get;}=[];public Task EnqueueAsync(EnqueueNotification notification,CancellationToken cancellationToken=default){if(fail){fail=false;throw new InvalidOperationException("transient");}Items.Add(notification);return Task.CompletedTask;}}
    private sealed class ProfilesStub(ProfileLookup profile):IProfilesModule
    {public int Calls{get;private set;}public Task<ProfileLookup?>FindByOwnerIdAsync(Guid ownerId,CancellationToken cancellationToken=default){Calls++;return Task.FromResult<ProfileLookup?>(ownerId==profile.OwnerId?profile:null);}public Task<IReadOnlyDictionary<Guid,ProfileLookup>>FindByOwnerIdsAsync(IReadOnlySet<Guid>ownerIds,CancellationToken cancellationToken=default)=>Task.FromResult<IReadOnlyDictionary<Guid,ProfileLookup>>(new Dictionary<Guid,ProfileLookup>());}
    private sealed class SocialGraphStub(bool current):ISocialGraphModule
    {public Task<bool>IsFollowNotificationCurrentAsync(Guid relationshipId,Guid actorId,Guid recipientId,long relationshipVersion,bool requiresApproval,CancellationToken cancellationToken=default)=>Task.FromResult(current);public Task<RelationshipLookup>GetAsync(Guid actorId,Guid targetId,CancellationToken cancellationToken=default)=>throw new NotSupportedException();public Task<IReadOnlyDictionary<Guid,RelationshipLookup>>GetManyAsync(Guid actorId,IReadOnlySet<Guid>targetIds,CancellationToken cancellationToken=default)=>throw new NotSupportedException();public Task<IReadOnlySet<Guid>>ListFollowingIdsAsync(Guid actorId,CancellationToken cancellationToken=default)=>throw new NotSupportedException();}
}
