using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.Modules.Comments.Contracts;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Feed.Domain.Ranking;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Reactions.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Feed.Application.Feeds;
public sealed record FeedAuthorSummary(Guid OwnerId, string Handle, string DisplayName, Guid? ProfileMediaId, bool IsVerified);
public sealed record FeedItem(ContentItem Content, FeedAuthorSummary? Author, ReactionSummary Reactions, long CommentCount, bool HasPoll, double Score, IReadOnlyList<string> RankingReasons);
public sealed record FeedPage(IReadOnlyList<FeedItem> Items, string? NextCursor, string Strategy);
public enum FeedKind { Following, Discovery, Profile }

public sealed class GetFeedHandler(IContentModule content, ISocialGraphModule graph, IReactionsModule reactions,
    ICommentsModule comments, IProfilesModule profiles, IRankingPolicy ranking, ICacheService cache, TimeProvider time)
{
    public async Task<FeedPage> HandleAsync(FeedKind kind, Guid viewerId, int limit, string? cursor, Guid? profileId, CancellationToken cancellationToken)
    {
        limit = Math.Clamp(limit, 1, 50);
        if (kind == FeedKind.Profile)
        {
            if (!profileId.HasValue) return EmptyProfilePage();
            var profile = await profiles.FindByOwnerIdAsync(profileId.Value, cancellationToken);
            if (profile is null) return EmptyProfilePage();
            if (profile.OwnerId != viewerId)
            {
                var relationship = await graph.GetAsync(viewerId, profile.OwnerId, cancellationToken);
                if (relationship.IsBlocked || relationship.IsBlockedByTarget || profile.IsPrivate && !relationship.IsFollowing)
                    return EmptyProfilePage();
            }
        }
        var generation = await cache.GetAsync<string>("feed:generation", cancellationToken) ?? "initial";
        var key = $"feed:v2:{generation}:{kind}:{viewerId:N}:{profileId?.ToString("N") ?? "none"}:{limit}:{cursor ?? "first"}";
        var cached = await cache.GetAsync<FeedPage>(key, cancellationToken); if (cached is not null) return cached;
        ContentPage contentPage;
        if (kind == FeedKind.Discovery) contentPage = await content.ListDiscoveryAsync(viewerId, limit, cursor, cancellationToken);
        else
        {
            IReadOnlySet<Guid> authors;
            if (kind == FeedKind.Profile && profileId.HasValue) authors = new HashSet<Guid> { profileId.Value };
            else { var following = await graph.ListFollowingIdsAsync(viewerId, cancellationToken); authors = following.Append(viewerId).ToHashSet(); }
            contentPage = await content.ListVisibleByAuthorsAsync(authors, viewerId, limit, cursor, cancellationToken);
        }
        var items = contentPage.Items;
        var pollContentIds = await content.ListPollContentIdsAsync(items.Select(x => x.Id).ToHashSet(), cancellationToken);
        var authorProfiles = await profiles.FindByOwnerIdsAsync(items.Select(x => x.AuthorId).ToHashSet(), cancellationToken);
        var decorated = new List<FeedItem>(items.Count);
        foreach (var x in items)
            decorated.Add(await DecorateAsync(x, viewerId, pollContentIds.Contains(x.Id), authorProfiles, cancellationToken));
        IReadOnlyList<FeedItem> ordered = kind == FeedKind.Discovery
            ? decorated.OrderByDescending(x => x.Score).ThenByDescending(x => x.Content.PublishedAtUtc).ThenBy(x => x.Content.Id).ToList()
            : decorated.OrderByDescending(x => x.Content.PublishedAtUtc).ThenBy(x => x.Content.Id).ToList();
        var next = contentPage.NextCursor;
        var page = new FeedPage(ordered, next, kind == FeedKind.Discovery ? "recency+relationship+engagement" : kind == FeedKind.Profile ? "chronological-profile" : "chronological-following");
        await cache.SetAsync(key, page, TimeSpan.FromMinutes(2), cancellationToken); return page;
    }

    private async Task<FeedItem> DecorateAsync(ContentItem item, Guid viewer, bool hasPoll,
        IReadOnlyDictionary<Guid, ProfileLookup> authorProfiles, CancellationToken cancellationToken)
    {
        var summary = await reactions.GetSummaryAsync(item.Id, viewer, cancellationToken);
        var commentCount = await comments.CountVisibleAsync(item.Id, cancellationToken);
        var relation = await graph.GetAsync(viewer, item.AuthorId, cancellationToken);
        var result = ranking.Rank(new(item.PublishedAtUtc, summary.Counts.Values.Sum(), commentCount, relation.IsFollowing, relation.IsCloseFriend), time.GetUtcNow());
        FeedAuthorSummary? author = null;
        if (authorProfiles.TryGetValue(item.AuthorId, out var profile) && (!profile.IsPrivate || profile.OwnerId == viewer || relation.IsFollowing))
            author = new(profile.OwnerId, profile.Handle, profile.DisplayName, profile.ProfileMediaId, profile.IsVerified);
        return new(item, author, summary, commentCount, hasPoll, result.Score, result.Reasons);
    }
    private static FeedPage EmptyProfilePage() => new([], null, "chronological-profile");
}
