using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Media.Contracts;

namespace ZosyalMedya.Modules.Content.Application.Posts;

public sealed record CreatePostCommand(ContentAuthorId AuthorId, string? Text, IReadOnlyList<Guid>? MediaIds,
    PostVisibility Visibility, ShareKind ShareKind, PostId? OriginalPostId, string? LinkUrl, string? ContentWarning,
    bool IsSensitive, bool IsDraft, DateTimeOffset? PublishAtUtc);
public sealed record UpdatePostCommand(PostId PostId, ContentAuthorId ActorId, string? Text, IReadOnlyList<Guid>? MediaIds,
    PostVisibility Visibility, string? LinkUrl, string? ContentWarning, bool IsSensitive, long ExpectedVersion);
public sealed record PostView(Guid Id, Guid AuthorId, string Text, IReadOnlyList<Guid> MediaIds, IReadOnlyList<string> Mentions,
    IReadOnlyList<string> Hashtags, string? LinkUrl, string? ContentWarning, bool IsSensitive, PostVisibility Visibility,
    PostStatus Status, ShareKind ShareKind, Guid? OriginalPostId, bool IsPinned, DateTimeOffset? PublishAtUtc,
    DateTimeOffset? PublishedAtUtc, DateTimeOffset CreatedAtUtc, long Version, long ViewCount);

public sealed class CreatePostHandler(IPostRepository posts, IContentModule content, IClock clock, ICacheService cache,
    ISearchModule search, IMediaModule media)
{
    public async Task<Result<PostView>> HandleAsync(CreatePostCommand command, CancellationToken cancellationToken)
    {
        if (command.OriginalPostId.HasValue && await content.GetVisibleAsync(command.OriginalPostId.Value.Value, command.AuthorId.Value, cancellationToken) is null)
            return Result.Failure<PostView>("content.original_not_visible", "Kaynak içerik bulunamadı veya görünür değil.");
        var mediaValidation = await PostMediaValidation.ValidateAsync(media, command.MediaIds, command.AuthorId.Value,
            command.Visibility, cancellationToken);
        if (mediaValidation is not null)
            return Result.Failure<PostView>(mediaValidation.Value.Code, mediaValidation.Value.Message);
        try
        {
            var post = Post.Create(PostId.New(), command.AuthorId, command.Text, command.MediaIds, command.Visibility,
                command.ShareKind, command.OriginalPostId, command.LinkUrl, command.ContentWarning, command.IsSensitive,
                command.IsDraft, command.PublishAtUtc, clock.UtcNow);
            await posts.CreateAsync(post, cancellationToken); await FeedCacheGeneration.AdvanceAsync(cache, cancellationToken);
            await SearchIndexing.SyncAsync(search, post, cancellationToken); return Result.Success(Map(post));
        }
        catch (DomainRuleException exception) { return Result.Failure<PostView>(exception.Code, exception.Message); }
    }
    internal static PostView Map(Post post) => new(post.Id.Value, post.AuthorId.Value, post.Text, post.MediaIds, post.Mentions,
        post.Hashtags, post.LinkUrl, post.ContentWarning, post.IsSensitive, post.Visibility, post.Status, post.ShareKind,
        post.OriginalPostId?.Value, post.IsPinned, post.PublishAtUtc, post.PublishedAtUtc, post.CreatedAtUtc, post.Version, post.ViewCount);
}

public sealed class UpdatePostHandler(IPostRepository posts, IClock clock, ICacheService cache, ISearchModule search,
    IMediaModule media)
{
    public async Task<Result<PostView>> HandleAsync(UpdatePostCommand command, CancellationToken cancellationToken)
    {
        var post = await posts.SelectAsync(x => x.Id == command.PostId, cancellationToken);
        if (post is null) return Result.Failure<PostView>("content.not_found", "İçerik bulunamadı.");
        if (post.Version != command.ExpectedVersion) return Result.Failure<PostView>("content.concurrency_conflict", "İçerik eşzamanlı değiştirildi.");
        var mediaValidation = await PostMediaValidation.ValidateAsync(media, command.MediaIds, command.ActorId.Value,
            command.Visibility, cancellationToken);
        if (mediaValidation is not null)
            return Result.Failure<PostView>(mediaValidation.Value.Code, mediaValidation.Value.Message);
        try { post.Edit(command.ActorId, command.Text, command.MediaIds, command.Visibility, command.LinkUrl, command.ContentWarning, command.IsSensitive, clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<PostView>(exception.Code, exception.Message); }
        if (!await posts.UpdateAsync(x => x.Id == post.Id, post, command.ExpectedVersion, cancellationToken)) return Result.Failure<PostView>("content.concurrency_conflict", "İçerik eşzamanlı değiştirildi.");
        await FeedCacheGeneration.AdvanceAsync(cache, cancellationToken); await SearchIndexing.SyncAsync(search, post, cancellationToken); return Result.Success(CreatePostHandler.Map(post));
    }
}

internal static class PostMediaValidation
{
    public static async Task<(string Code, string Message)?> ValidateAsync(IMediaModule media,
        IReadOnlyList<Guid>? mediaIds, Guid ownerId, PostVisibility visibility, CancellationToken token)
    {
        foreach (var id in (mediaIds ?? []).Distinct())
        {
            var asset = await media.GetAuthorizedAsync(id, ownerId, token);
            if (asset is null || asset.OwnerId != ownerId || asset.Status != "Ready")
                return ("content.media_invalid", "Medya bulunamadı, hazır değil veya bu hesaba ait değil.");
            if (!string.Equals(asset.Visibility, visibility.ToString(), StringComparison.Ordinal))
                return ("content.media_visibility_mismatch", "Medya ile gönderi aynı görünürlüğe sahip olmalı.");
        }
        return null;
    }
}

public enum PostChange { Archive, Restore, Delete, Pin, Unpin }
public sealed class ChangePostHandler(IPostRepository posts, IClock clock, ICacheService cache, ISearchModule search)
{
    public async Task<Result<PostView>> HandleAsync(PostId id, ContentAuthorId actor, PostChange change, CancellationToken token)
    {
        var post = await posts.SelectAsync(x => x.Id == id, token); if (post is null) return Result.Failure<PostView>("content.not_found", "İçerik bulunamadı.");
        var version = post.Version;
        try { switch (change) { case PostChange.Archive: post.Archive(actor, clock.UtcNow); break; case PostChange.Restore: post.Restore(actor, clock.UtcNow); break; case PostChange.Delete: post.Delete(actor, clock.UtcNow); break; case PostChange.Pin: post.SetPinned(actor, true, clock.UtcNow); break; case PostChange.Unpin: post.SetPinned(actor, false, clock.UtcNow); break; } }
        catch (DomainRuleException exception) { return Result.Failure<PostView>(exception.Code, exception.Message); }
        if (!await posts.UpdateAsync(x => x.Id == id, post, version, token)) return Result.Failure<PostView>("content.concurrency_conflict", "İçerik eşzamanlı değiştirildi.");
        await FeedCacheGeneration.AdvanceAsync(cache, token); await SearchIndexing.SyncAsync(search, post, token); return Result.Success(CreatePostHandler.Map(post));
    }
}

public sealed class GetContentHandler(IContentModule content)
{
    public async Task<Result<ContentItem>> HandleAsync(Guid id, Guid? viewerId, CancellationToken token)
    { var item = await content.GetVisibleAsync(id, viewerId, token); return item is null ? Result.Failure<ContentItem>("content.not_found", "İçerik bulunamadı veya görünür değil.") : Result.Success(item); }
}

public sealed class PublishScheduledPostsHandler(IPostRepository posts, IClock clock, ICacheService cache, ISearchModule search)
{
    public async Task<int> HandleAsync(CancellationToken cancellationToken)
    {
        var published = 0;
        foreach (var post in await posts.ListDueScheduledAsync(clock.UtcNow, 100, cancellationToken))
        {
            var version = post.Version;
            post.PublishDue(clock.UtcNow);
            if (!await posts.UpdateAsync(x => x.Id == post.Id, post, version, cancellationToken)) continue;
            published++;
            await FeedCacheGeneration.AdvanceAsync(cache, cancellationToken);
            await SearchIndexing.SyncAsync(search, post, cancellationToken);
        }
        return published;
    }
}

public sealed class ContentModule(IPostRepository posts, IPollRepository polls, ISocialGraphModule graph, IModerationModule moderation, IClock clock, ICacheService cache) : IContentModule
{
    public async Task<ContentItem?> GetVisibleAsync(Guid contentId, Guid? viewerId, CancellationToken cancellationToken = default)
    {
        var post = await posts.SelectAsync(x => x.Id == new PostId(contentId), cancellationToken); if (post is null) return null;
        await PublishDueAsync(post, cancellationToken); return await IsVisibleAsync(post, viewerId, cancellationToken) ? Map(post) : null;
    }
    public async Task<ContentPage> ListVisibleByAuthorsAsync(IReadOnlySet<Guid> authorIds, Guid viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default)
    {
        if (authorIds.Count == 0) return new([], null);
        var ids = authorIds.Select(x => new ContentAuthorId(x)).ToHashSet();
        return await ListVisiblePageAsync(ids, false, viewerId, limit, cursor, cancellationToken);
    }
    public async Task<ContentPage> ListDiscoveryAsync(Guid? viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default)
    {
        return await ListVisiblePageAsync(null, true, viewerId, limit, cursor, cancellationToken);
    }
    public async Task<IReadOnlySet<Guid>> ListPollContentIdsAsync(IReadOnlySet<Guid> contentIds, CancellationToken cancellationToken = default)
    {
        if (contentIds.Count == 0) return new HashSet<Guid>();
        var postIds = contentIds.Select(x => new PostId(x)).ToHashSet();
        return (await polls.ListExistingPostIdsAsync(postIds, cancellationToken))
            .Select(x => x.Value)
            .ToHashSet();
    }
    public async Task<bool> CanEngageAsync(Guid contentId, Guid actorId, CancellationToken cancellationToken = default)
        => await GetVisibleAsync(contentId, actorId, cancellationToken) is { Status: "Published" };
    private async Task PublishDueAsync(Post post, CancellationToken token) { var version = post.Version; post.PublishDue(clock.UtcNow); if (post.Version != version && await posts.UpdateAsync(x => x.Id == post.Id, post, version, token)) await FeedCacheGeneration.AdvanceAsync(cache, token); }
    private async Task<ContentPage> ListVisiblePageAsync(IReadOnlySet<ContentAuthorId>? authorIds,
        bool publicOnly, Guid? viewerId, int limit, string? cursor, CancellationToken token)
    {
        var (cursorTime, cursorId) = DecodeCursor(cursor);
        var batchSize = Math.Min(Math.Max(limit * 2, 20), 100);
        var result = new List<ContentItem>(limit);
        Post? lastScanned = null;
        var exhausted = false;
        for (var batch = 0; batch < 5 && result.Count < limit; batch++)
        {
            var candidates = await posts.ListFeedPageAsync(new PostFeedQuery(authorIds, publicOnly, cursorTime,
                cursorTime.HasValue ? new PostId(cursorId) : null, batchSize), token);
            foreach (var post in candidates)
            {
                lastScanned = post;
                if (await IsVisibleAsync(post, viewerId, token)) result.Add(Map(post));
                if (result.Count == limit) break;
            }
            if (result.Count == limit) break;
            if (candidates.Count < batchSize) { exhausted = true; break; }
            var last = candidates[^1];
            cursorTime = last.PublishedAtUtc ?? last.CreatedAtUtc;
            cursorId = last.Id.Value;
        }
        return new(result, exhausted || lastScanned is null ? null : EncodeCursor(lastScanned));
    }
    private async Task<bool> IsVisibleAsync(Post post, Guid? viewerId, CancellationToken token)
    {
        if (await moderation.IsSubjectRemovedAsync(ModeratedSubjectType.Content, post.Id.Value, token)) return false;
        if (post.Status != PostStatus.Published) return viewerId == post.AuthorId.Value && post.Status is PostStatus.Draft or PostStatus.Scheduled or PostStatus.Archived;
        if (viewerId == post.AuthorId.Value) return true; if (!viewerId.HasValue || post.Visibility == PostVisibility.Private) return post.Visibility == PostVisibility.Public;
        var relation = await graph.GetAsync(viewerId.Value, post.AuthorId.Value, token); if (relation.IsBlocked || relation.IsBlockedByTarget || relation.IsMuted) return false;
        if (post.Visibility == PostVisibility.Public) return true; if (post.Visibility == PostVisibility.Followers) return relation.IsFollowing;
        var authorView = await graph.GetAsync(post.AuthorId.Value, viewerId.Value, token); return post.Visibility == PostVisibility.CloseFriends && authorView.IsCloseFriend;
    }
    private static ContentItem Map(Post post) => new(post.Id.Value, post.AuthorId.Value, post.Text, post.Visibility.ToString(), post.Status.ToString(), post.ShareKind.ToString(), post.OriginalPostId?.Value,
        post.MediaIds, post.Mentions, post.Hashtags, post.LinkUrl, post.ContentWarning, post.IsSensitive, post.IsPinned, post.PublishedAtUtc ?? post.CreatedAtUtc, post.Version, post.ViewCount);
    private static (DateTimeOffset? Time, Guid Id) DecodeCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, Guid.Empty);
        try { var parts = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|'); return (new DateTimeOffset(long.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture), TimeSpan.Zero), Guid.Parse(parts[1])); }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException) { throw new DomainRuleException("feed.cursor_invalid", "Sayfalama imleci geçersiz."); }
    }
    private static string EncodeCursor(Post post) => Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(
        $"{(post.PublishedAtUtc ?? post.CreatedAtUtc).UtcTicks.ToString(System.Globalization.CultureInfo.InvariantCulture)}|{post.Id.Value:D}"));
}

internal static class FeedCacheGeneration
{
    public const string Key = "feed:generation";
    public static Task AdvanceAsync(ICacheService cache, CancellationToken token) => cache.SetAsync(Key, Guid.NewGuid().ToString("N"), TimeSpan.FromDays(7), token);
}

internal static class SearchIndexing
{
    public static Task SyncAsync(ISearchModule search, Post post, CancellationToken token)
    {
        if (post.Status != PostStatus.Published)
            return search.RemoveAsync(SearchDocumentType.Content, post.Id.Value, post.Version, token);
        var visibility = post.Visibility == PostVisibility.Public ? SearchVisibility.Public
            : post.Visibility == PostVisibility.Followers ? SearchVisibility.Followers : SearchVisibility.Private;
        var title = string.IsNullOrWhiteSpace(post.Text) ? "Medya paylaşımı" : post.Text[..Math.Min(post.Text.Length, 120)];
        return search.IndexAsync(new SearchDocumentContract(post.Id.Value, SearchDocumentType.Content,
            post.AuthorId.Value, title, post.Text, post.Hashtags, visibility, false,
            $"/icerik/{post.Id.Value:D}", post.UpdatedAtUtc, post.Version), token);
    }
}
