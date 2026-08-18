using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Search.Domain.Documents;

namespace ZosyalMedya.Modules.Search.Application.Ports;

public sealed record SearchCandidate(SearchDocument Document, string Snippet, double Score, IReadOnlyList<string> MatchedTags);

public interface ISearchRepository
{
    Task UpsertAsync(SearchDocumentContract source, CancellationToken cancellationToken = default);
    Task RemoveAsync(SearchDocumentType type, Guid id, long sourceVersion, DateTimeOffset now,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SearchCandidate>> SearchAsync(string query, Guid? viewerId, IReadOnlySet<Guid> followedOwnerIds,
        SearchDocumentType? type, int limit, CancellationToken cancellationToken = default);
    Task TrackRecentAsync(Guid userId, string query, DateTimeOffset now, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> ListRecentAsync(Guid userId, int limit, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<(string Tag, long Score)>> TrendingTagsAsync(DateTimeOffset since, int limit,
        CancellationToken cancellationToken = default);
}
