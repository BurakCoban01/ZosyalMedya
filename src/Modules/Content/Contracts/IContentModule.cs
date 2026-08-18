namespace ZosyalMedya.Modules.Content.Contracts;

public sealed record ContentItem(
    Guid Id, Guid AuthorId, string Text, string Visibility, string Status, string ShareKind, Guid? OriginalPostId,
    IReadOnlyList<Guid> MediaIds, IReadOnlyList<string> Mentions, IReadOnlyList<string> Hashtags,
    string? LinkUrl, string? ContentWarning, bool IsSensitive, bool IsPinned, DateTimeOffset PublishedAtUtc,
    long Version,
    long ViewCount);
public sealed record ContentPage(IReadOnlyList<ContentItem> Items, string? NextCursor);

public interface IContentModule
{
    Task<ContentItem?> GetVisibleAsync(Guid contentId, Guid? viewerId, CancellationToken cancellationToken = default);
    Task<ContentPage> ListVisibleByAuthorsAsync(IReadOnlySet<Guid> authorIds, Guid viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default);
    Task<ContentPage> ListDiscoveryAsync(Guid? viewerId, int limit, string? cursor = null, CancellationToken cancellationToken = default);
    Task<IReadOnlySet<Guid>> ListPollContentIdsAsync(IReadOnlySet<Guid> contentIds, CancellationToken cancellationToken = default);
    Task<bool> CanEngageAsync(Guid contentId, Guid actorId, CancellationToken cancellationToken = default);
}
