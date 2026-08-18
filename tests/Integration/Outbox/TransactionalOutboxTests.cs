using Microsoft.EntityFrameworkCore;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Outbox;
public sealed class TransactionalOutboxTests
{
    [Fact]
    public async Task PublishedPostAndVersionedOutboxMessageCommitTogether()
    {
        if(!InfrastructureTestGate.IsEnabled)return;
        const string connection="Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        await using(var integration=new OutboxDbContext(new DbContextOptionsBuilder<OutboxDbContext>().UseNpgsql(connection).Options))await integration.Database.MigrateAsync();
        var interceptor=new OutboxSaveChangesInterceptor(TimeProvider.System);
        await using var content=new ContentDbContext(new DbContextOptionsBuilder<ContentDbContext>().UseNpgsql(connection).AddInterceptors(interceptor).Options);
        await content.Database.MigrateAsync();var repository=new PostgreSqlPostRepository(content);var post=Post.Create(PostId.New(),new(Guid.NewGuid()),"Outbox sözleşmesi #event",[],PostVisibility.Public,ShareKind.Original,null,null,null,false,false,null,DateTimeOffset.UtcNow);
        await repository.CreateAsync(post);
        await using var verify=new OutboxDbContext(new DbContextOptionsBuilder<OutboxDbContext>().UseNpgsql(connection).Options);
        var message=(await verify.Messages.Where(x=>x.Type.Contains("PostPublished")).ToListAsync()).Single(x=>x.Payload.Contains(post.Id.Value.ToString(),StringComparison.OrdinalIgnoreCase));
        Assert.EndsWith(":v1",message.Type,StringComparison.Ordinal);Assert.Empty(post.DomainEvents);
        await verify.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM integration.outbox WHERE \"Id\" = {message.Id}");
        await content.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM content.posts WHERE \"Id\" = {post.Id.Value}");
    }

    [Fact]
    public async Task FollowRelationshipAndVersionedNotificationEventCommitTogether()
    {
        if(!InfrastructureTestGate.IsEnabled)return;
        const string connection="Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        await using(var integration=new OutboxDbContext(new DbContextOptionsBuilder<OutboxDbContext>().UseNpgsql(connection).Options))await integration.Database.MigrateAsync();
        var interceptor=new OutboxSaveChangesInterceptor(TimeProvider.System);
        await using var graph=new SocialGraphDbContext(new DbContextOptionsBuilder<SocialGraphDbContext>().UseNpgsql(connection).AddInterceptors(interceptor).Options);
        await graph.Database.MigrateAsync();var repository=new PostgreSqlRelationshipRepository(graph);
        var relationship=Relationship.Create(RelationshipId.New(),new(Guid.NewGuid()),new(Guid.NewGuid()),DateTimeOffset.UtcNow);
        relationship.RequestFollow(true,DateTimeOffset.UtcNow);await repository.CreateAsync(relationship);
        await using var verify=new OutboxDbContext(new DbContextOptionsBuilder<OutboxDbContext>().UseNpgsql(connection).Options);
        var message=(await verify.Messages.Where(x=>x.Type.Contains("FollowStarted")).ToListAsync()).Single(x=>x.Payload.Contains(relationship.Id.Value.ToString(),StringComparison.OrdinalIgnoreCase));
        Assert.EndsWith(":v1",message.Type,StringComparison.Ordinal);Assert.Empty(relationship.DomainEvents);
        await verify.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM integration.outbox WHERE \"Id\" = {message.Id}");
        await graph.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM social_graph.relationships WHERE \"Id\" = {relationship.Id.Value}");
    }
}
