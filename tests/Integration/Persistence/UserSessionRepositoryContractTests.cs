using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class UserSessionRepositoryContractTests
{
    protected abstract Task<IUserSessionRepository> CreateRepositoryAsync();

    [Fact]
    public async Task RotationHistorySupportsReuseDetectionAndOptimisticConcurrency()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var now = new DateTimeOffset(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);
        var suffix = Guid.NewGuid().ToString("N");
        var session = UserSession.Start(SessionId.New(), UserId.New(), $"device-{suffix}", "Test cihazı", $"hash-a-{suffix}", now, now.AddDays(30));

        await repository.CreateAsync(session);
        var loaded = await repository.FindByTokenHashAsync($"hash-a-{suffix}");
        Assert.NotNull(loaded);
        var initialVersion = loaded!.Version;
        Assert.Equal(RefreshRotationOutcome.Rotated, loaded.Rotate($"hash-a-{suffix}", $"hash-b-{suffix}", now.AddMinutes(1), now.AddDays(30)));
        Assert.True(await repository.UpdateAsync(x => x.Id == loaded.Id, loaded, initialVersion));
        Assert.False(await repository.UpdateAsync(x => x.Id == loaded.Id, loaded, initialVersion));

        var foundThroughConsumedHash = await repository.FindByTokenHashAsync($"hash-a-{suffix}");
        Assert.NotNull(foundThroughConsumedHash);
        var rotatedVersion = foundThroughConsumedHash!.Version;
        Assert.Equal(RefreshRotationOutcome.ReuseDetected, foundThroughConsumedHash.Rotate($"hash-a-{suffix}", $"hash-c-{suffix}", now.AddMinutes(2), now.AddDays(30)));
        Assert.True(await repository.UpdateAsync(x => x.Id == foundThroughConsumedHash.Id, foundThroughConsumedHash, rotatedVersion));

        var persisted = await repository.SelectAsync(x => x.Id == session.Id);
        Assert.True(persisted!.IsRevoked);
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == session.Id));
    }
}

public sealed class PostgreSqlUserSessionRepositoryContractTests : UserSessionRepositoryContractTests
{
    protected override async Task<IUserSessionRepository> CreateRepositoryAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me")
            .Options;
        var context = new IdentityDbContext(options);
        await context.Database.MigrateAsync();
        return new PostgreSqlUserSessionRepository(context);
    }
}

public sealed class MongoUserSessionRepositoryContractTests : UserSessionRepositoryContractTests
{
    protected override async Task<IUserSessionRepository> CreateRepositoryAsync()
    {
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var repository = new MongoUserSessionRepository(database);
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
