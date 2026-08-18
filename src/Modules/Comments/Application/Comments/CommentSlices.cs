using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Comments.Application.Ports;
using ZosyalMedya.Modules.Comments.Contracts;
using ZosyalMedya.Modules.Comments.Domain.Comments;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Comments.Application.Comments;

public sealed record CommentAuthorSummary(Guid OwnerId, string Handle, string DisplayName,
    Guid? ProfileMediaId, bool IsVerified);
public sealed record CommentView(
    Guid Id,
    Guid ContentId,
    Guid? AuthorId,
    Guid? ParentId,
    int Depth,
    string Text,
    IReadOnlyList<string> Mentions,
    string Status,
    DateTimeOffset CreatedAtUtc,
    long Version,
    CommentAuthorSummary? Author,
    bool CanManage);
public sealed record CommentPage(IReadOnlyList<CommentView> Items, string? NextCursor);

public sealed class CreateCommentHandler(
    ICommentRepository comments,
    IContentModule content,
    IClock clock,
    ICacheService cache,
    IProfilesModule profiles)
{
    public async Task<Result<CommentView>> HandleAsync(
        Guid contentId,
        Guid actorId,
        Guid? parentId,
        string text,
        CancellationToken cancellationToken)
    {
        if (!await content.CanEngageAsync(contentId, actorId, cancellationToken))
        {
            return Result.Failure<CommentView>(
                "comments.content_unavailable",
                "İçerik yorumlara açık değil.");
        }

        Comment? parent = null;
        if (parentId.HasValue)
        {
            parent = await comments.SelectAsync(x => x.Id == new CommentId(parentId.Value), cancellationToken);
            if (parent is null ||
                parent.ContentId != new CommentedContentId(contentId) ||
                parent.Status != CommentStatus.Visible)
            {
                return Result.Failure<CommentView>("comments.parent_invalid", "Üst yorum bulunamadı.");
            }
        }

        try
        {
            var item = Comment.Create(
                CommentId.New(),
                new CommentAuthorId(actorId),
                new CommentedContentId(contentId),
                parent?.Id,
                (parent?.Depth ?? -1) + 1,
                text,
                clock.UtcNow);

            await comments.CreateAsync(item, cancellationToken);
            await AdvanceFeedGenerationAsync(cancellationToken);
            var profile = await profiles.FindByOwnerIdAsync(actorId, cancellationToken);
            return Result.Success(Map(item, ProfileSummary(profile), true));
        }
        catch (DomainRuleException exception)
        {
            return Result.Failure<CommentView>(exception.Code, exception.Message);
        }
    }

    internal static CommentView Map(Comment item, CommentAuthorSummary? author, bool canManage) => new(
        item.Id.Value,
        item.ContentId.Value,
        item.Status == CommentStatus.Deleted ? null : author?.OwnerId,
        item.ParentId?.Value,
        item.Depth,
        item.Text,
        item.Mentions,
        item.Status.ToString(),
        item.CreatedAtUtc,
        item.Version,
        item.Status == CommentStatus.Deleted ? null : author,
        canManage && item.Status == CommentStatus.Visible);

    internal static CommentAuthorSummary? ProfileSummary(ProfileLookup? profile) => profile is null ? null :
        new(profile.OwnerId, profile.Handle, profile.DisplayName, profile.ProfileMediaId, profile.IsVerified);

    private Task AdvanceFeedGenerationAsync(CancellationToken cancellationToken) =>
        cache.SetAsync(
            "feed:generation",
            Guid.NewGuid().ToString("N"),
            TimeSpan.FromDays(7),
            cancellationToken);
}

public sealed class ListCommentsHandler(
    ICommentRepository comments,
    IProfilesModule profiles,
    ISocialGraphModule graph,
    IContentModule content)
{
    public async Task<CommentPage> HandleAsync(
        Guid contentId,
        Guid? viewerId,
        int limit,
        string? cursor,
        CancellationToken cancellationToken)
    {
        if (await content.GetVisibleAsync(contentId, viewerId, cancellationToken) is null)
        {
            throw new DomainRuleException("comments.content_not_visible", "İçerik bulunamadı veya görünür değil.");
        }

        limit = Math.Clamp(limit, 1, 50);
        var (cursorTime, cursorId) = DecodeCursor(cursor);
        var raw = await comments.ListPageAsync(new(new CommentedContentId(contentId), cursorTime,
            cursorId.HasValue ? new CommentId(cursorId.Value) : null, limit + 1), cancellationToken);
        var pageRows = raw.Take(limit).ToArray();
        var authorIds = pageRows.Where(x => x.Status == CommentStatus.Visible).Select(x => x.AuthorId.Value).ToHashSet();
        var profileMap = await profiles.FindByOwnerIdsAsync(authorIds, cancellationToken);
        IReadOnlyDictionary<Guid, RelationshipLookup> relations = viewerId.HasValue
            ? await graph.GetManyAsync(viewerId.Value, authorIds.Where(id => id != viewerId.Value).ToHashSet(), cancellationToken)
            : new Dictionary<Guid, RelationshipLookup>();
        var items = pageRows.Select(item =>
        {
            profileMap.TryGetValue(item.AuthorId.Value, out var profile);
            relations.TryGetValue(item.AuthorId.Value, out var relation);
            var visible = profile is not null && (viewerId == item.AuthorId.Value ||
                !profile.IsPrivate || relation is { IsFollowing: true }) &&
                relation is not { IsBlocked: true } && relation is not { IsBlockedByTarget: true };
            return CreateCommentHandler.Map(item, visible ? CreateCommentHandler.ProfileSummary(profile) : null,
                viewerId == item.AuthorId.Value);
        }).ToArray();
        var next = raw.Count > limit && pageRows.Length > 0 ? EncodeCursor(pageRows[^1]) : null;
        return new(items, next);
    }

    private static (DateTimeOffset? Time, Guid? Id) DecodeCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, null);
        try
        {
            var value = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|');
            if (value.Length != 2 || !DateTimeOffset.TryParseExact(value[0], "O",
                    System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind,
                    out var time) || !Guid.TryParse(value[1], out var id)) throw new FormatException();
            return (time, id);
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException)
        {
            throw new DomainRuleException("comments.cursor_invalid", "Yorum sayfalama imleci geçersiz.");
        }
    }

    private static string EncodeCursor(Comment item) => Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(
        $"{item.CreatedAtUtc:O}|{item.Id.Value:D}"));
}

public sealed class ChangeCommentHandler(
    ICommentRepository comments,
    IClock clock,
    ICacheService cache,
    IProfilesModule profiles)
{
    public async Task<Result<CommentView>> HandleAsync(
        Guid contentId,
        Guid id,
        Guid actorId,
        string? text,
        CancellationToken cancellationToken)
    {
        var item = await comments.SelectAsync(x => x.Id == new CommentId(id), cancellationToken);
        if (item is null || item.ContentId != new CommentedContentId(contentId))
        {
            return Result.Failure<CommentView>("comments.not_found", "Yorum bulunamadı.");
        }

        var expectedVersion = item.Version;
        try
        {
            if (text is null)
            {
                item.Delete(new CommentAuthorId(actorId), clock.UtcNow);
            }
            else
            {
                item.Edit(new CommentAuthorId(actorId), text, clock.UtcNow);
            }
        }
        catch (DomainRuleException exception)
        {
            return Result.Failure<CommentView>(exception.Code, exception.Message);
        }

        if (!await comments.UpdateAsync(
                x => x.Id == item.Id,
                item,
                expectedVersion,
                cancellationToken))
        {
            return Result.Failure<CommentView>(
                "comments.concurrency_conflict",
                "Yorum eşzamanlı değiştirildi.");
        }

        await AdvanceFeedGenerationAsync(cancellationToken);
        var profile = await profiles.FindByOwnerIdAsync(actorId, cancellationToken);
        return Result.Success(CreateCommentHandler.Map(item, CreateCommentHandler.ProfileSummary(profile), true));
    }

    private Task AdvanceFeedGenerationAsync(CancellationToken cancellationToken) =>
        cache.SetAsync(
            "feed:generation",
            Guid.NewGuid().ToString("N"),
            TimeSpan.FromDays(7),
            cancellationToken);
}

public sealed class CommentsModule(ICommentRepository comments) : ICommentsModule
{
    public Task<long> CountVisibleAsync(
        Guid contentId,
        CancellationToken cancellationToken = default) =>
        comments.CountVisibleAsync(new CommentedContentId(contentId), cancellationToken);
}
