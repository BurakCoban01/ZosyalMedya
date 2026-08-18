using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class RelationshipRepositoryContractTests
{
    protected abstract Task<IRelationshipRepository> CreateRepositoryAsync();

    [Fact]
    public async Task DirectedUniquenessStateUpdateSortAndDeleteBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var now = new DateTimeOffset(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);
        var actor = new GraphUserId(Guid.NewGuid());
        var target = new GraphUserId(Guid.NewGuid());
        var relationship = Relationship.Create(RelationshipId.New(), actor, target, now);
        relationship.RequestFollow(true, now);
        await repository.CreateAsync(relationship);

        Assert.NotNull(await repository.SelectAsync(x => x.ActorId == actor && x.TargetId == target));
        Assert.Single(await repository.ListByFilterAsync(x => x.TargetId == target,
            new QueryOptions<Relationship>(10, [new(x => x.UpdatedAtUtc, ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Descending)])));
        var expectedVersion = relationship.Version;
        relationship.AcceptFollow(now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion));
        Assert.False(await repository.UpdateAsync(x => x.Id == relationship.Id, relationship, expectedVersion));
        Assert.Equal(1, await repository.CountAsync(target, RelationshipReadKind.Followers));
        var followerPage = await repository.ListPageAsync(new(target, RelationshipReadKind.Followers, 0, 10));
        Assert.Single(followerPage);
        Assert.Equal(actor, followerPage[0].ActorId);

        var duplicate = Relationship.Create(RelationshipId.New(), actor, target, now);
        await Assert.ThrowsAsync<PersistenceConflictException>(() => repository.CreateAsync(duplicate));
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == relationship.Id));
    }
}

public sealed class PostgreSqlRelationshipRepositoryContractTests : RelationshipRepositoryContractTests
{
    protected override async Task<IRelationshipRepository> CreateRepositoryAsync()
    {
        var context = new SocialGraphDbContext(new DbContextOptionsBuilder<SocialGraphDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await context.Database.MigrateAsync();
        return new PostgreSqlRelationshipRepository(context);
    }
}

public sealed class MongoRelationshipRepositoryContractTests : RelationshipRepositoryContractTests
{
    [Fact]
    public void EmbeddedOutboxFieldsDoNotBreakRelationshipRoundTrip()
    {
        _=new MongoRelationshipRepository(new MongoClient("mongodb://localhost:57017").GetDatabase("mapping_only"));
        var relationship=Relationship.Create(RelationshipId.New(),new(Guid.NewGuid()),new(Guid.NewGuid()),DateTimeOffset.UtcNow);
        relationship.RequestFollow(true,DateTimeOffset.UtcNow);var document=relationship.ToBsonDocument();document["_pendingEvents"]=new BsonArray{new BsonDocument("Id",new BsonBinaryData(Guid.NewGuid(),GuidRepresentation.Standard))};
        var roundTrip=BsonSerializer.Deserialize<Relationship>(document);
        Assert.Equal(relationship.Id,roundTrip.Id);Assert.Equal(FollowState.Pending,roundTrip.FollowState);
    }

    protected override async Task<IRelationshipRepository> CreateRepositoryAsync()
    {
        var repository = new MongoRelationshipRepository(new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests"));
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
