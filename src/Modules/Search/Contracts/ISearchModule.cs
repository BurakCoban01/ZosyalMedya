namespace ZosyalMedya.Modules.Search.Contracts;

public enum SearchDocumentType { Profile, Content, Question, Hashtag, Community }
public enum SearchVisibility { Public, Followers, Private }
public sealed record SearchDocumentContract(Guid Id, SearchDocumentType Type, Guid OwnerId, string Title,
    string Body, IReadOnlyList<string> Tags, SearchVisibility Visibility, bool IsHidden, string DeepLink,
    DateTimeOffset UpdatedAtUtc, long SourceVersion);
public sealed record SearchHit(Guid Id, SearchDocumentType Type, Guid OwnerId, string Title, string Snippet,
    string DeepLink, double Score, IReadOnlyList<string> MatchedTags);
public sealed record SearchPage(IReadOnlyList<SearchHit> Items, int Limit);

public interface ISearchModule
{
    Task IndexAsync(SearchDocumentContract document, CancellationToken cancellationToken = default);
    Task RemoveAsync(SearchDocumentType type, Guid id, long sourceVersion, CancellationToken cancellationToken = default);
    Task<SearchPage> SearchAsync(string query, Guid? viewerId, SearchDocumentType? type, int limit,
        CancellationToken cancellationToken = default);
}
