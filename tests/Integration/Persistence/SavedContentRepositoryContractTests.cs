using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Domain.Saved;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;
public abstract class SavedContentRepositoryContractTests
{
    protected abstract Task<(IPostRepository Posts, ISavedContentRepository Saved)> CreateAsync();
    [Fact]
    public async Task SaveListFilterAndDeleteBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var (posts, saved) = await CreateAsync(); var now = DateTimeOffset.UtcNow; var owner = Guid.NewGuid();
        var post = Post.Create(PostId.New(), new(Guid.NewGuid()), "Kaydedilecek", [], PostVisibility.Public, ShareKind.Original, null, null, null, false, false, null, now);
        await posts.CreateAsync(post); var item = SavedContent.Create(SavedContentId.New(), owner, post.Id, "Araştırma", now);
        await saved.CreateAsync(item); Assert.NotNull(await saved.SelectAsync(x => x.Id == item.Id));
        var page = await saved.ListPageAsync(new(owner, "Araştırma", null, null, 10)); Assert.Contains(page, x => x.Id == item.Id);
        Assert.Equal(1, await saved.DeleteByFilterAsync(x => x.Id == item.Id));
    }
}
public sealed class PostgreSqlSavedContentRepositoryContractTests : SavedContentRepositoryContractTests
{
    protected override async Task<(IPostRepository, ISavedContentRepository)> CreateAsync()
    { var db = new ContentDbContext(new DbContextOptionsBuilder<ContentDbContext>().UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options); await db.Database.MigrateAsync(); return (new PostgreSqlPostRepository(db), new PostgreSqlSavedContentRepository(db)); }
}
public sealed class MongoSavedContentRepositoryContractTests : SavedContentRepositoryContractTests
{
    protected override async Task<(IPostRepository, ISavedContentRepository)> CreateAsync()
    { var db = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests"); var posts = new MongoPostRepository(db); var saved = new MongoSavedContentRepository(db); await posts.EnsureIndexesAsync(CancellationToken.None); await saved.EnsureIndexesAsync(CancellationToken.None); return (posts, saved); }
}
