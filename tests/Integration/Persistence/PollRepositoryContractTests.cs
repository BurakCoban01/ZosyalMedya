using Microsoft.EntityFrameworkCore;
using MongoDB.Driver;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Persistence;

public abstract class PollRepositoryContractTests
{
    protected abstract Task<(IPostRepository Posts, IPollRepository Polls, Func<Task> Cleanup)> CreateAsync();
    [Fact]
    public async Task CreateVoteCountsAndDuplicateBallotBehaveEqually()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        var (posts, polls, cleanup) = await CreateAsync();
        try
        {
            var now = DateTimeOffset.UtcNow; var author = new ContentAuthorId(Guid.NewGuid());
            var post = Post.Create(PostId.New(), author, "Anketli içerik", [], PostVisibility.Public, ShareKind.Original, null, null, null, false, false, null, now);
            await posts.CreateAsync(post);
            var poll = Poll.Create(PollId.New(), post.Id, author, "Tercihiniz?", ["A", "B"], false, now.AddHours(1), now);
            await polls.CreateAsync(poll);
            var unrelatedPostId = PostId.New();
            var existingPostIds = await polls.ListExistingPostIdsAsync(new HashSet<PostId> { post.Id, unrelatedPostId });
            Assert.Contains(post.Id, existingPostIds);
            Assert.DoesNotContain(unrelatedPostId, existingPostIds);
            var actor = Guid.NewGuid();
            Assert.Equal(PollVoteOutcome.Accepted, await polls.CastVoteAsync(poll.Id, actor, new HashSet<PollOptionId> { poll.Options[0].Id }, now.AddMinutes(1)));
            Assert.Equal(PollVoteOutcome.AlreadyVoted, await polls.CastVoteAsync(poll.Id, actor, new HashSet<PollOptionId> { poll.Options[1].Id }, now.AddMinutes(2)));
            var saved = await polls.GetByPostAsync(post.Id);
            Assert.NotNull(saved); Assert.Equal(1, saved!.Options.Sum(x => x.VoteCount));
        }
        finally { await cleanup(); }
    }
}

public sealed class PostgreSqlPollRepositoryContractTests : PollRepositoryContractTests
{
    protected override async Task<(IPostRepository, IPollRepository, Func<Task>)> CreateAsync()
    {
        var context = new ContentDbContext(new DbContextOptionsBuilder<ContentDbContext>().UseNpgsql("Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await context.Database.MigrateAsync();
        return (new PostgreSqlPostRepository(context), new PostgreSqlPollRepository(context), () => Task.CompletedTask);
    }
}

public sealed class MongoPollRepositoryContractTests : PollRepositoryContractTests
{
    protected override async Task<(IPostRepository, IPollRepository, Func<Task>)> CreateAsync()
    {
        var database = new MongoClient("mongodb://localhost:57017").GetDatabase("zosyalmedya_contract_tests");
        var posts = new MongoPostRepository(database); var polls = new MongoPollRepository(database);
        await posts.EnsureIndexesAsync(CancellationToken.None); await polls.EnsureIndexesAsync(CancellationToken.None);
        return (posts, polls, () => Task.CompletedTask);
    }
}
