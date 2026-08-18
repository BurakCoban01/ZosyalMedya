using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Security;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class SecurityChallengeRepositoryContractTests
{
    protected abstract Task<ISecurityChallengeRepository> CreateRepositoryAsync();

    [Fact]
    public async Task TokenLookupAndOptimisticSingleUseBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var now = DateTimeOffset.UtcNow;
        var hash = Guid.NewGuid().ToString("N").ToUpperInvariant();
        var challenge = SecurityChallenge.Issue(SecurityChallengeId.New(), UserId.New(),
            SecurityChallengePurpose.VerifyEmail, hash, now, TimeSpan.FromHours(1));
        await repository.CreateAsync(challenge);
        var selected = await repository.FindByTokenHashAsync(hash, SecurityChallengePurpose.VerifyEmail);
        Assert.NotNull(selected);
        var version = selected!.Version;
        selected.Consume(now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == selected.Id, selected, version));
        Assert.False(await repository.UpdateAsync(x => x.Id == selected.Id, selected, version));
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == selected.Id));
    }
}

public sealed class PostgreSqlSecurityChallengeRepositoryContractTests : SecurityChallengeRepositoryContractTests
{
    protected override async Task<ISecurityChallengeRepository> CreateRepositoryAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options;
        var context = new IdentityDbContext(options);
        await context.Database.MigrateAsync();
        return new PostgreSqlSecurityChallengeRepository(context);
    }
}

public sealed class MongoSecurityChallengeRepositoryContractTests : SecurityChallengeRepositoryContractTests
{
    protected override async Task<ISecurityChallengeRepository> CreateRepositoryAsync()
    {
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var repository = new MongoSecurityChallengeRepository(database);
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
