using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class UserAccountRepositoryContractTests
{
    protected abstract Task<IUserAccountRepository> CreateRepositoryAsync();

    [Fact]
    public async Task CreateSelectListUpdateConcurrencyDeleteAndDuplicateBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var suffix = Guid.NewGuid().ToString("N");
        var now = new DateTimeOffset(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);
        var account = UserAccount.Register(UserId.New(), $"u{suffix[..12]}", $"{suffix}@example.test", "adaptive-hash", now);

        var createdId = await repository.CreateAsync(account);
        Assert.Equal(account.Id, createdId);
        var selected = await repository.SelectAsync(x => x.Id == createdId);
        Assert.NotNull(selected);

        var listed = await repository.ListByFilterAsync(
            x => x.NormalizedEmail == account.NormalizedEmail,
            new QueryOptions<UserAccount>(10, [new(x => x.Username, ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending)]));
        Assert.Single(listed);

        var expectedVersion = selected!.Version;
        selected.RecordSuccessfulLogin(now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == createdId, selected, expectedVersion));
        Assert.False(await repository.UpdateAsync(x => x.Id == createdId, selected, expectedVersion));

        var duplicate = UserAccount.Register(UserId.New(), $"d{suffix[..12]}", account.Email, "adaptive-hash", now);
        var conflict = await Assert.ThrowsAsync<PersistenceConflictException>(() => repository.CreateAsync(duplicate));
        Assert.Equal("identity.unique_conflict", conflict.Code);

        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == createdId));
        Assert.Null(await repository.SelectAsync(x => x.Id == createdId));
    }

    [Fact]
    public async Task PreCancelledQueryHonorsCancellation()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        using var source = new CancellationTokenSource();
        source.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => repository.SelectAsync(_ => true, source.Token));
    }

    [Fact]
    public async Task VisitorPageIsDomainScopedBoundedAndContinuesAfterItsReturnedCursor()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var suffix = Guid.NewGuid().ToString("N");
        var now = new DateTimeOffset(2026, 8, 17, 8, 0, 0, TimeSpan.Zero);
        var visitors = new[]
        {
            UserAccount.Register(UserId.New(), $"v{suffix[..10]}a", $"{suffix}a@visitor.escp.test", "hash", now),
            UserAccount.Register(UserId.New(), $"v{suffix[..10]}b", $"{suffix}b@visitor.escp.test", "hash", now)
        };
        var outsider = UserAccount.Register(UserId.New(), $"o{suffix[..10]}", $"{suffix}@example.test", "hash", now);
        foreach (var account in visitors.Append(outsider)) await repository.CreateAsync(account);

        try
        {
            var first = await repository.ListVisitorPageAsync("visitor.escp.test", null, 1);
            Assert.Single(first);
            Assert.EndsWith("@visitor.escp.test", first[0].Email, StringComparison.OrdinalIgnoreCase);

            var second = await repository.ListVisitorPageAsync("visitor.escp.test", first[0].Id, 10);
            Assert.Single(second);
            Assert.NotEqual(first[0].Id, second[0].Id);
            Assert.DoesNotContain(second, item => item.Id == outsider.Id);
        }
        finally
        {
            var ids = visitors.Append(outsider).Select(x => x.Id).ToHashSet();
            await repository.DeleteByFilterAsync(x => ids.Contains(x.Id));
        }
    }
}

public sealed class PostgreSqlUserAccountRepositoryContractTests : UserAccountRepositoryContractTests
{
    protected override async Task<IUserAccountRepository> CreateRepositoryAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me")
            .Options;
        var context = new IdentityDbContext(options);
        await context.Database.MigrateAsync();
        return new PostgreSqlUserAccountRepository(context);
    }
}

public sealed class MongoUserAccountRepositoryContractTests : UserAccountRepositoryContractTests
{
    protected override async Task<IUserAccountRepository> CreateRepositoryAsync()
    {
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var repository = new MongoUserAccountRepository(database);
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
