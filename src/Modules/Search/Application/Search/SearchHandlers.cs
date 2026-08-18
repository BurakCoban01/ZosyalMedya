using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Search.Application.Ports;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Search.Application.Search;

public sealed class SearchModule(ISearchRepository repository, ISocialGraphModule socialGraph, IClock clock) : ISearchModule
{
    public Task IndexAsync(SearchDocumentContract document, CancellationToken cancellationToken = default) =>
        repository.UpsertAsync(document, cancellationToken);

    public Task RemoveAsync(SearchDocumentType type, Guid id, long sourceVersion,
        CancellationToken cancellationToken = default) => repository.RemoveAsync(type, id, sourceVersion, clock.UtcNow, cancellationToken);

    public async Task<SearchPage> SearchAsync(string query, Guid? viewerId, SearchDocumentType? type, int limit,
        CancellationToken cancellationToken = default)
    {
        var normalized = Domain.Documents.RecentSearch.Normalize(query);
        var bounded = Math.Clamp(limit, 1, 50);
        IReadOnlySet<Guid> following = viewerId.HasValue
            ? await socialGraph.ListFollowingIdsAsync(viewerId.Value, cancellationToken)
            : new HashSet<Guid>();
        var candidates = await repository.SearchAsync(normalized, viewerId, following, type, bounded, cancellationToken);
        if (viewerId.HasValue) await repository.TrackRecentAsync(viewerId.Value, normalized, clock.UtcNow, cancellationToken);
        return new(candidates.Select(x => new SearchHit(x.Document.Id.Value, x.Document.Type, x.Document.OwnerId,
            x.Document.Title, x.Snippet, x.Document.DeepLink, x.Score, x.MatchedTags)).ToArray(), bounded);
    }
}

public sealed class SearchDiscoveryHandler(ISearchRepository repository, IClock clock)
{
    public Task<IReadOnlyList<string>> RecentAsync(Guid userId, int limit, CancellationToken token) =>
        repository.ListRecentAsync(userId, Math.Clamp(limit, 1, 20), token);
    public async Task<IReadOnlyList<TrendingTagView>> TrendingAsync(int limit, CancellationToken token) =>
        (await repository.TrendingTagsAsync(clock.UtcNow.AddDays(-7), Math.Clamp(limit, 1, 50), token))
        .Select(x => new TrendingTagView(x.Tag, x.Score)).ToArray();
}

public sealed record TrendingTagView(string Tag, long Score);
