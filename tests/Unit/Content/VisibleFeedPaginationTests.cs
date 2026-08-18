using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Content;

public sealed class VisibleFeedPaginationTests
{
    [Fact]
    public async Task HiddenNewerPostsDoNotTruncateOlderVisibleProfilePosts()
    {
        var owner = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var hidden = Enumerable.Range(0, 25).Select(index =>
            Post.Create(PostId.New(), new ContentAuthorId(owner), $"hidden-{index}", null,
                PostVisibility.Followers, ShareKind.Original, null, null, null, false, false, null,
                now.AddMinutes(-index))).ToArray();
        var visible = Enumerable.Range(0, 12).Select(index =>
            Post.Create(PostId.New(), new ContentAuthorId(owner), $"public-{index}", null,
                PostVisibility.Public, ShareKind.Original, null, null, null, false, false, null,
                now.AddMinutes(-(25 + index)))).ToArray();
        var module = new ContentModule(new FeedRepository([.. hidden, .. visible]), null!, new GraphStub(),
            new ModerationStub(), null!, null!);

        var page = await module.ListVisibleByAuthorsAsync(new HashSet<Guid> { owner }, Guid.NewGuid(), 10);

        Assert.Equal(10, page.Items.Count);
        Assert.Equal(visible.Take(10).Select(post => post.Id.Value), page.Items.Select(item => item.Id));
        Assert.NotNull(page.NextCursor);
    }

    [Fact]
    public async Task HiddenHistoryScanIsBoundedAndReturnsRawContinuation()
    {
        var owner = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var hidden = Enumerable.Range(0, 120).Select(index =>
            Post.Create(PostId.New(), new ContentAuthorId(owner), $"hidden-{index}", null,
                PostVisibility.Followers, ShareKind.Original, null, null, null, false, false, null,
                now.AddMinutes(-index))).ToArray();
        var repository = new FeedRepository(hidden);
        var module = new ContentModule(repository, null!, new GraphStub(), new ModerationStub(), null!, null!);

        var page = await module.ListVisibleByAuthorsAsync(new HashSet<Guid> { owner }, Guid.NewGuid(), 10);

        Assert.Empty(page.Items);
        Assert.NotNull(page.NextCursor);
        Assert.Equal(5, repository.PageCalls);
    }

    private sealed class FeedRepository(IReadOnlyList<Post> posts) : IPostRepository
    {
        public int PageCalls { get; private set; }
        public Task<IReadOnlyList<Post>> ListFeedPageAsync(PostFeedQuery request, CancellationToken cancellationToken = default)
        {
            PageCalls++;
            var start = request.CursorId is null ? 0 : posts.ToList().FindIndex(post => post.Id == request.CursorId.Value) + 1;
            return Task.FromResult<IReadOnlyList<Post>>(posts.Skip(start).Take(request.Limit).ToArray());
        }
        public Task<Post?> SelectAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<Post>> ListByFilterAsync(Expression<Func<Post, bool>> predicate, QueryOptions<Post>? options = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<PostId> CreateAsync(Post entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Post, bool>> predicate, Post replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Post, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<Post>> ListDueScheduledAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class GraphStub : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, false, false, false, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class ModerationStub : IModerationModule
    {
        public Task<bool> CanPerformAsync(Guid userId, ModerationCapability capability, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> IsSubjectRemovedAsync(ModeratedSubjectType type, Guid subjectId, CancellationToken cancellationToken = default) => Task.FromResult(false);
    }
}
