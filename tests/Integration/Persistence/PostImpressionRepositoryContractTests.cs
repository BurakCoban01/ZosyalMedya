using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;
public abstract class PostImpressionRepositoryContractTests
{
    protected abstract Task<(IPostRepository Posts, IPostImpressionRepository Impressions)> CreateAsync();
    [Fact]
    public async Task SameViewerCountsOncePerUtcDay()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var (posts, impressions) = await CreateAsync(); var now = DateTimeOffset.UtcNow;
        var post = Post.Create(PostId.New(), new(Guid.NewGuid()), "Görüntülenecek", [], PostVisibility.Public, ShareKind.Original, null, null, null, false, false, null, now);
        await posts.CreateAsync(post); var day = DateOnly.FromDateTime(now.UtcDateTime); var viewer = Guid.NewGuid().ToString("N").PadRight(64, '0');
        Assert.True(await impressions.RecordUniqueAsync(post.Id, viewer, day));
        Assert.False(await impressions.RecordUniqueAsync(post.Id, viewer, day));
        Assert.True(await impressions.RecordUniqueAsync(post.Id, viewer, day.AddDays(1)));
        Assert.Equal(2, (await posts.SelectAsync(x => x.Id == post.Id))!.ViewCount);
    }
}
public sealed class PostgreSqlPostImpressionRepositoryContractTests : PostImpressionRepositoryContractTests
{
    protected override async Task<(IPostRepository, IPostImpressionRepository)> CreateAsync()
    { var db = new ContentDbContext(new DbContextOptionsBuilder<ContentDbContext>().UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options); await db.Database.MigrateAsync(); return (new PostgreSqlPostRepository(db), new PostgreSqlPostImpressionRepository(db, TimeProvider.System)); }
}
public sealed class MongoPostImpressionRepositoryContractTests : PostImpressionRepositoryContractTests
{
    protected override async Task<(IPostRepository, IPostImpressionRepository)> CreateAsync()
    { var db = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests"); var posts = new MongoPostRepository(db); var impressions = new MongoPostImpressionRepository(db); await posts.EnsureIndexesAsync(CancellationToken.None); await impressions.EnsureIndexesAsync(CancellationToken.None); return (posts, impressions); }
}
