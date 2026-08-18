using System.Text;
using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.Moderation.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class PostRepositoryContractTests
{
    protected abstract Task<IPostRepository> CreateRepositoryAsync();

    [Fact]
    public async Task CreateSelectSortRevisionConcurrencyAndDeleteBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;

        var repository = await CreateRepositoryAsync();
        var now = new DateTimeOffset(2026, 7, 12, 9, 0, 0, TimeSpan.Zero);
        var author = new ContentAuthorId(Guid.NewGuid());
        var post = Post.Create(
            PostId.New(), author, "Repository #contract", [], PostVisibility.Public,
            ShareKind.Original, null, null, null, false, false, null, now);

        await repository.CreateAsync(post);
        Assert.NotNull(await repository.SelectAsync(x => x.Id == post.Id));
        Assert.Single(await repository.ListByFilterAsync(
            x => x.AuthorId == author,
            new QueryOptions<Post>(10, [new(
                x => x.PublishedAtUtc!,
                ZosyalMedya.BuildingBlocks.Application.Persistence.SortDirection.Descending)])));

        var version = post.Version;
        post.Edit(
            author, "Updated #contract", [], PostVisibility.Followers,
            null, null, false, now.AddMinutes(1));

        Assert.True(await repository.UpdateAsync(x => x.Id == post.Id, post, version));
        Assert.False(await repository.UpdateAsync(x => x.Id == post.Id, post, version));
        var updated = await repository.SelectAsync(x => x.Id == post.Id);
        Assert.Single(updated!.Revisions);
        await Assert.ThrowsAsync<PersistenceConflictException>(() => repository.CreateAsync(post));
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == post.Id));
    }

    [Fact]
    public async Task CursorPaginationIsStableAndDoesNotRepeatItems()
    {
        if (!InfrastructureTestGate.IsEnabled) return;

        var repository = await CreateRepositoryAsync();
        var publishedAt = new DateTimeOffset(2026, 7, 12, 10, 0, 0, TimeSpan.Zero);
        var author = new ContentAuthorId(Guid.NewGuid());
        var posts = Enumerable.Range(1, 3)
            .Select(index => Post.Create(
                PostId.New(), author, $"Cursor post {index}", [], PostVisibility.Public,
                ShareKind.Original, null, null, null, false, false, null, publishedAt))
            .ToArray();

        foreach (var post in posts) await repository.CreateAsync(post);

        var module = new ContentModule(repository, new EmptyPollRepository(), new PermissiveGraph(), new PermissiveModeration(), new FixedClock(publishedAt), new MemoryCache());
        var authors = new HashSet<Guid> { author.Value };
        var first = await module.ListVisibleByAuthorsAsync(authors, author.Value, 1);
        Assert.Single(first.Items);

        var cursor = first.NextCursor;
        var second = await module.ListVisibleByAuthorsAsync(authors, author.Value, 1, cursor);

        Assert.Single(second.Items);
        Assert.NotEqual(first.Items[0].Id, second.Items[0].Id);
        Assert.True(first.Items[0].Id.CompareTo(second.Items[0].Id) < 0);

        await repository.DeleteByFilterAsync(x => x.AuthorId == author);
    }

    private sealed class FixedClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow => now;
    }

    private sealed class EmptyPollRepository : IPollRepository
    {
        public Task<ZosyalMedya.Modules.Content.Domain.Polls.Poll?> GetByPostAsync(PostId postId, CancellationToken cancellationToken = default) =>
            Task.FromResult<ZosyalMedya.Modules.Content.Domain.Polls.Poll?>(null);

        public Task<IReadOnlySet<PostId>> ListExistingPostIdsAsync(IReadOnlySet<PostId> postIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<PostId>>(new HashSet<PostId>());

        public Task CreateAsync(ZosyalMedya.Modules.Content.Domain.Polls.Poll poll, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task<ZosyalMedya.Modules.Content.Domain.Polls.PollVoteOutcome> CastVoteAsync(
            ZosyalMedya.Modules.Content.Domain.Polls.PollId pollId, Guid actorId,
            IReadOnlySet<ZosyalMedya.Modules.Content.Domain.Polls.PollOptionId> optionIds,
            DateTimeOffset now, CancellationToken cancellationToken = default) =>
            Task.FromResult(ZosyalMedya.Modules.Content.Domain.Polls.PollVoteOutcome.PollNotFound);
    }

    private sealed class PermissiveGraph : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, false, false, false, false, false));

        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class MemoryCache : ICacheService
    {
        private readonly Dictionary<string, object?> values = [];

        public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default) =>
            Task.FromResult(values.TryGetValue(key, out var value) ? (T?)value : default);

        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
        {
            values[key] = value;
            return Task.CompletedTask;
        }

        public Task RemoveAsync(string key, CancellationToken cancellationToken = default)
        {
            values.Remove(key);
            return Task.CompletedTask;
        }
    }

    private sealed class PermissiveModeration : IModerationModule
    {
        public Task<bool> CanPerformAsync(Guid userId, ModerationCapability capability, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<bool> IsSubjectRemovedAsync(ModeratedSubjectType type, Guid subjectId, CancellationToken cancellationToken = default) => Task.FromResult(false);
    }
}

public sealed class PostgreSqlPostRepositoryContractTests : PostRepositoryContractTests
{
    protected override async Task<IPostRepository> CreateRepositoryAsync()
    {
        var db = new ContentDbContext(new DbContextOptionsBuilder<ContentDbContext>()
            .UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me")
            .Options);
        await db.Database.MigrateAsync();
        return new PostgreSqlPostRepository(db);
    }
}

public sealed class MongoPostRepositoryContractTests : PostRepositoryContractTests
{
    protected override async Task<IPostRepository> CreateRepositoryAsync()
    {
        var repository = new MongoPostRepository(
            new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests"));
        await repository.EnsureIndexesAsync(CancellationToken.None);
        return repository;
    }
}
