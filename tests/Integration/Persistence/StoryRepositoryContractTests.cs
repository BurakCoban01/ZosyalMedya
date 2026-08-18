using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Domain.Stories;
using ZosyalMedya.Modules.Stories.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class StoryRepositoryContractTests
{
    protected abstract Task<IStoryRepository> CreateRepositoryAsync();

    [Fact]
    public async Task ActivePagingConcurrencyExpiryDeletionAndMediaUniquenessBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var now = new DateTimeOffset(2026, 8, 14, 12, 0, 0, TimeSpan.Zero);
        var owner = new StoryOwnerId(Guid.NewGuid());
        var newer = Story.Create(StoryId.New(), owner, Guid.NewGuid(), "Yeni", StoryAudience.Public, now);
        var older = Story.Create(StoryId.New(), owner, Guid.NewGuid(), "Eski", StoryAudience.Followers, now.AddMinutes(-1));
        var expired = Story.Create(StoryId.New(), owner, Guid.NewGuid(), "Süresi dolan", StoryAudience.Public, now.AddHours(-25));
        await repository.CreateAsync(newer); await repository.CreateAsync(older); await repository.CreateAsync(expired);

        var first = await repository.ListPageAsync(new(owner, now, null, null, 1));
        var second = await repository.ListPageAsync(new(owner, now, first[0].CreatedAtUtc, first[0].Id, 2));
        Assert.Equal(newer.Id, Assert.Single(first).Id);
        Assert.Equal(older.Id, Assert.Single(second).Id);
        Assert.Null(await repository.FindActiveByMediaAsync(expired.MediaId, now));

        var version = newer.Version; newer.Delete(owner, now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == newer.Id, newer, version));
        Assert.False(await repository.UpdateAsync(x => x.Id == newer.Id, newer, version));
        Assert.Null(await repository.FindActiveByMediaAsync(newer.MediaId, now.AddMinutes(1)));
        await Assert.ThrowsAsync<PersistenceConflictException>(() => repository.CreateAsync(
            Story.Create(StoryId.New(), owner, older.MediaId, null, StoryAudience.Public, now)));

        await repository.DeleteByFilterAsync(x => x.OwnerId == owner);
    }
}

public sealed class PostgreSqlStoryRepositoryContractTests : StoryRepositoryContractTests
{
    protected override async Task<IStoryRepository> CreateRepositoryAsync()
    {
        var db = new StoriesDbContext(new DbContextOptionsBuilder<StoriesDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync();
        return new PostgreSqlStoryRepository(db);
    }
}

public sealed class MongoStoryRepositoryContractTests : StoryRepositoryContractTests
{
    protected override async Task<IStoryRepository> CreateRepositoryAsync()
    {
        var repository = new MongoStoryRepository(new MongoClient("mongodb://localhost:57017")
            .GetDatabase("zosyalmedya_contract_tests"));
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
