using Microsoft.EntityFrameworkCore;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Search.Infrastructure.Persistence;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Search;

public sealed class SearchRepositoryTests
{
    [Fact]
    public async Task FullTextTypoVisibilityRecentAndTrendingBehaveTogether()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        await using var db = new SearchDbContext(new DbContextOptionsBuilder<SearchDbContext>().UseNpgsql(
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync();
        var repository = new PostgreSqlSearchRepository(db);
        var owner = Guid.NewGuid(); var follower = Guid.NewGuid(); var outsider = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        var publicId = Guid.NewGuid(); var followerId = Guid.NewGuid(); var privateId = Guid.NewGuid();
        await repository.UpsertAsync(new(publicId, SearchDocumentType.Content, owner, "Modüler mimari rehberi",
            "Bağımlılık yönü ve bounded context örneği", ["mimari"], SearchVisibility.Public, false,
            $"/icerik/{publicId}", now, 1));
        await repository.UpsertAsync(new(followerId, SearchDocumentType.Content, owner, "Takipçi mimari notu",
            "Yalnız takipçilere görünür", ["mimari"], SearchVisibility.Followers, false,
            $"/icerik/{followerId}", now, 1));
        await repository.UpsertAsync(new(privateId, SearchDocumentType.Content, owner, "Özel mimari taslağı",
            "Gizli", ["mimari"], SearchVisibility.Private, false, $"/icerik/{privateId}", now, 1));
        var anonymous = await repository.SearchAsync("mimari", null, new HashSet<Guid>(), null, 20);
        Assert.Contains(anonymous, x => x.Document.Id.Value == publicId);
        Assert.DoesNotContain(anonymous, x => x.Document.Id.Value == followerId);
        var following = await repository.SearchAsync("mimari", follower, new HashSet<Guid> { owner }, null, 20);
        Assert.Contains(following, x => x.Document.Id.Value == followerId);
        Assert.DoesNotContain(following, x => x.Document.Id.Value == privateId);
        var mine = await repository.SearchAsync("mimari", owner, new HashSet<Guid>(), null, 20);
        Assert.Contains(mine, x => x.Document.Id.Value == privateId);
        var typo = await repository.SearchAsync("mimary", outsider, new HashSet<Guid>(), null, 20);
        Assert.Contains(typo, x => x.Document.Id.Value == publicId);
        await repository.TrackRecentAsync(follower, "mimari", now);
        Assert.Equal("mimari", Assert.Single(await repository.ListRecentAsync(follower, 10)));
        Assert.Contains(await repository.TrendingTagsAsync(now.AddDays(-1), 10), x => x.Tag == "mimari");
        await repository.RemoveAsync(SearchDocumentType.Content, publicId, 2, now);
        Assert.DoesNotContain(await repository.SearchAsync("mimari", null, new HashSet<Guid>(), null, 20),
            x => x.Document.Id.Value == publicId);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM search.documents WHERE \"OwnerId\" = {owner}");
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM search.recent_searches WHERE \"UserId\" = {follower}");
    }
}
