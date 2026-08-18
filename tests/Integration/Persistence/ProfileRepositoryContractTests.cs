using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class ProfileRepositoryContractTests
{
    protected abstract Task<IProfileRepository> CreateRepositoryAsync();

    [Fact]
    public async Task CreateSelectSortUpdateConflictAndDeleteBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var repository = await CreateRepositoryAsync();
        var suffix = Guid.NewGuid().ToString("N");
        var now = new DateTimeOffset(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);
        var profile = Profile.Create(ProfileId.New(), new ProfileOwnerId(Guid.NewGuid()), $"p_{suffix[..12]}", "Test Profili", now);
        await repository.CreateAsync(profile);
        Assert.NotNull(await repository.SelectAsync(x => x.Id == profile.Id));
        Assert.Single(await repository.ListByFilterAsync(x => x.OwnerId == profile.OwnerId,
            new QueryOptions<Profile>(10, [new(x => x.Handle, ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Ascending)])));

        var expectedVersion = profile.Version;
        profile.Update(profile.Handle, "Güncel Profil", "bio", null, null, null, null, null, true,
            ProfileTheme.Dark, ProfileLanguage.English, false, now.AddMinutes(1));
        Assert.True(await repository.UpdateAsync(x => x.Id == profile.Id, profile, expectedVersion));
        Assert.False(await repository.UpdateAsync(x => x.Id == profile.Id, profile, expectedVersion));

        var duplicate = Profile.Create(ProfileId.New(), new ProfileOwnerId(Guid.NewGuid()), profile.Handle, "Başka", now);
        await Assert.ThrowsAsync<PersistenceConflictException>(() => repository.CreateAsync(duplicate));
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == profile.Id));
    }
}

public sealed class PostgreSqlProfileRepositoryContractTests : ProfileRepositoryContractTests
{
    protected override async Task<IProfileRepository> CreateRepositoryAsync()
    {
        var context = new ProfilesDbContext(new DbContextOptionsBuilder<ProfilesDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await context.Database.MigrateAsync();
        return new PostgreSqlProfileRepository(context);
    }
}

public sealed class MongoProfileRepositoryContractTests : ProfileRepositoryContractTests
{
    protected override async Task<IProfileRepository> CreateRepositoryAsync()
    {
        var repository = new MongoProfileRepository(new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests"));
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
