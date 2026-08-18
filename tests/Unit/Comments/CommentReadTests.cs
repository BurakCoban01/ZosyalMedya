using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Comments.Application.Comments;
using ZosyalMedya.Modules.Comments.Application.Ports;
using ZosyalMedya.Modules.Comments.Domain.Comments;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Comments;

public sealed class CommentReadTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 13, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ListBatchesProfilesAndHidesPrivateOrBlockedAuthorIdentity()
    {
        var viewer = Guid.NewGuid();
        var publicAuthor = Guid.NewGuid();
        var privateAuthor = Guid.NewGuid();
        var blockedAuthor = Guid.NewGuid();
        var content = Guid.NewGuid();
        var repository = new CommentRepositoryStub(
            MakeComment(publicAuthor, content, 0),
            MakeComment(privateAuthor, content, 1),
            MakeComment(blockedAuthor, content, 2));
        var profiles = new ProfilesStub(
            new ProfileLookup(publicAuthor, "public_user", "Public User", false, null, false),
            new ProfileLookup(privateAuthor, "private_user", "Private User", true, null, false),
            new ProfileLookup(blockedAuthor, "blocked_user", "Blocked User", false, null, false));
        var graph = new GraphStub(new Dictionary<Guid, RelationshipLookup>
        {
            [privateAuthor] = new(viewer, privateAuthor, false, false, false, false, false),
            [blockedAuthor] = new(viewer, blockedAuthor, false, true, false, false, false)
        });

        var page = await new ListCommentsHandler(repository, profiles, graph, new ContentStub())
            .HandleAsync(content, viewer, 20, null, default);

        Assert.Equal("public_user", page.Items[0].Author?.Handle);
        Assert.Equal(publicAuthor, page.Items[0].AuthorId);
        Assert.Null(page.Items[1].Author);
        Assert.Null(page.Items[1].AuthorId);
        Assert.Null(page.Items[2].Author);
        Assert.Null(page.Items[2].AuthorId);
        Assert.Equal(1, profiles.BatchCalls);
        Assert.Equal(1, graph.BatchCalls);
    }

    [Fact]
    public async Task CursorPagesAThreadWithoutRepeatingRowsAndKeepsDeletedTombstone()
    {
        var author = Guid.NewGuid();
        var content = Guid.NewGuid();
        var rows = Enumerable.Range(0, 4).Select(index => MakeComment(author, content, index)).ToArray();
        rows[1].Delete(new(author), Now.AddMinutes(10));
        var handler = new ListCommentsHandler(new CommentRepositoryStub(rows),
            new ProfilesStub(new ProfileLookup(author, "author", "Author", false, null, false)), new GraphStub(), new ContentStub());

        var first = await handler.HandleAsync(content, author, 2, null, default);
        var second = await handler.HandleAsync(content, author, 2, first.NextCursor, default);

        Assert.Equal(2, first.Items.Count);
        Assert.NotNull(first.NextCursor);
        Assert.Equal("Deleted", first.Items[1].Status);
        Assert.Null(first.Items[1].Author);
        Assert.Null(first.Items[1].AuthorId);
        Assert.Equal(2, second.Items.Count);
        Assert.Null(second.NextCursor);
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(second.Items.Select(x => x.Id)));
    }

    [Fact]
    public async Task ChangeRejectsACommentFromAnotherContentPath()
    {
        var actor = Guid.NewGuid();
        var item = MakeComment(actor, Guid.NewGuid(), 0);
        var handler = new ChangeCommentHandler(new CommentRepositoryStub(item), new ClockStub(), new CacheStub(),
            new ProfilesStub(new ProfileLookup(actor, "owner", "Owner", false, null, false)));

        var result = await handler.HandleAsync(Guid.NewGuid(), item.Id.Value, actor, "changed", default);

        Assert.False(result.IsSuccess);
        Assert.Equal("comments.not_found", result.Error.Code);
        Assert.Equal("comment-0", item.Text);
    }

    [Fact]
    public async Task ListRejectsCommentsWhenTheContentIsNotVisibleWithoutReadingTheThread()
    {
        var content = Guid.NewGuid();
        var repository = new CommentRepositoryStub(MakeComment(Guid.NewGuid(), content, 0));
        var handler = new ListCommentsHandler(repository, new ProfilesStub(), new GraphStub(), new ContentStub(false));

        var error = await Assert.ThrowsAsync<DomainRuleException>(() =>
            handler.HandleAsync(content, Guid.NewGuid(), 20, null, default));

        Assert.Equal("comments.content_not_visible", error.Code);
        Assert.Equal(0, repository.PageCalls);
    }

    [Fact]
    public async Task ReplyRejectsADeletedParent()
    {
        var actor = Guid.NewGuid();
        var content = Guid.NewGuid();
        var parent = MakeComment(actor, content, 0);
        parent.Delete(new(actor), Now.AddMinutes(1));
        var handler = new CreateCommentHandler(new CommentRepositoryStub(parent), new ContentStub(), new ClockStub(),
            new CacheStub(), new ProfilesStub(new ProfileLookup(actor, "owner", "Owner", false, null, false)));

        var result = await handler.HandleAsync(content, actor, parent.Id.Value, "reply", default);

        Assert.False(result.IsSuccess);
        Assert.Equal("comments.parent_invalid", result.Error.Code);
    }

    private static Comment MakeComment(Guid author, Guid content, int index) => Comment.Create(
        new CommentId(Guid.Parse($"00000000-0000-0000-0000-{index + 1:D12}")), new(author), new(content), null, 0,
        $"comment-{index}", Now.AddMinutes(index));

    private sealed class CommentRepositoryStub(params Comment[] rows) : ICommentRepository
    {
        private readonly List<Comment> items = [.. rows];
        public int PageCalls { get; private set; }
        public Task<Comment?> SelectAsync(Expression<Func<Comment, bool>> predicate, CancellationToken cancellationToken = default) =>
            Task.FromResult(items.AsQueryable().SingleOrDefault(predicate));
        public Task<IReadOnlyList<Comment>> ListByFilterAsync(Expression<Func<Comment, bool>> predicate,
            QueryOptions<Comment>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Comment>>(items.AsQueryable().Where(predicate).Take(options?.BoundedLimit ?? 50).ToArray());
        public Task<IReadOnlyList<Comment>> ListPageAsync(CommentPageQuery query, CancellationToken cancellationToken = default)
        {
            PageCalls++;
            return Task.FromResult<IReadOnlyList<Comment>>(items.Where(x => x.ContentId == query.ContentId && x.Status != CommentStatus.Moderated)
                .Where(x => !query.CursorTime.HasValue || x.CreatedAtUtc > query.CursorTime.Value ||
                    x.CreatedAtUtc == query.CursorTime.Value && x.Id.Value.CompareTo(query.CursorId!.Value.Value) > 0)
                .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id.Value).Take(query.Limit).ToArray());
        }
        public Task<CommentId> CreateAsync(Comment entity, CancellationToken cancellationToken = default)
        { items.Add(entity); return Task.FromResult(entity.Id); }
        public Task<bool> UpdateAsync(Expression<Func<Comment, bool>> predicate, Comment replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<long> DeleteByFilterAsync(Expression<Func<Comment, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult(0L);
        public Task<long> CountVisibleAsync(CommentedContentId contentId, CancellationToken cancellationToken = default) =>
            Task.FromResult((long)items.Count(x => x.ContentId == contentId && x.Status == CommentStatus.Visible));
    }

    private sealed class ProfilesStub(params ProfileLookup[] rows) : IProfilesModule
    {
        public int BatchCalls { get; private set; }
        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(rows.SingleOrDefault(x => x.OwnerId == ownerId));
        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds,
            CancellationToken cancellationToken = default)
        { BatchCalls++; return Task.FromResult<IReadOnlyDictionary<Guid, ProfileLookup>>(rows.Where(x => ownerIds.Contains(x.OwnerId)).ToDictionary(x => x.OwnerId)); }
    }

    private sealed class GraphStub(IReadOnlyDictionary<Guid, RelationshipLookup>? rows = null) : ISocialGraphModule
    {
        public int BatchCalls { get; private set; }
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(rows?.GetValueOrDefault(targetId) ?? new(actorId, targetId, false, false, false, false, false));
        public Task<IReadOnlyDictionary<Guid, RelationshipLookup>> GetManyAsync(Guid actorId, IReadOnlySet<Guid> targetIds,
            CancellationToken cancellationToken = default)
        { BatchCalls++; return Task.FromResult<IReadOnlyDictionary<Guid, RelationshipLookup>>(targetIds.ToDictionary(id => id, id => rows?.GetValueOrDefault(id) ?? new(actorId, id, false, false, false, false, false))); }
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class ContentStub(bool visible = true) : IContentModule
    {
        public Task<bool> CanEngageAsync(Guid contentId, Guid actorId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<ContentItem?> GetVisibleAsync(Guid contentId, Guid? viewerId, CancellationToken cancellationToken = default) =>
            Task.FromResult<ContentItem?>(visible ? new(contentId, Guid.NewGuid(), "visible", "Public", "Published", "Original", null,
                [], [], [], null, null, false, false, Now, 1, 0) : null);
        public Task<ContentPage> ListVisibleByAuthorsAsync(IReadOnlySet<Guid> authorIds, Guid viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<ContentPage> ListDiscoveryAsync(Guid? viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlySet<Guid>> ListPollContentIdsAsync(IReadOnlySet<Guid> contentIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class ClockStub : IClock { public DateTimeOffset UtcNow => Now; }
    private sealed class CacheStub : ICacheService
    {
        public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default) => Task.FromResult(default(T));
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveAsync(string key, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
