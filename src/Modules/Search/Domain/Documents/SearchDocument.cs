using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Search.Contracts;

namespace ZosyalMedya.Modules.Search.Domain.Documents;

public readonly record struct SearchDocumentId(Guid Value);

public sealed class SearchDocument : AggregateRoot<SearchDocumentId>
{
    private SearchDocument() : base(default) { }
    private SearchDocument(SearchDocumentContract source) : base(new(source.Id)) { Apply(source); }
    public SearchDocumentType Type { get; private set; }
    public Guid OwnerId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public string[] Tags { get; private set; } = [];
    public SearchVisibility Visibility { get; private set; }
    public bool IsHidden { get; private set; }
    public bool IsDeleted { get; private set; }
    public string DeepLink { get; private set; } = string.Empty;
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public long SourceVersion { get; private set; }
    public static SearchDocument Create(SearchDocumentContract source) => new(source);
    public void Refresh(SearchDocumentContract source)
    {
        if (source.Id != Id.Value || source.Type != Type) throw new DomainRuleException("search.identity_mismatch", "Arama belgesi kimliği değiştirilemez.");
        if (source.SourceVersion <= SourceVersion) return;
        Apply(source);
    }
    public void Remove(long sourceVersion, DateTimeOffset now)
    {
        if (sourceVersion < SourceVersion) return;
        IsDeleted = true; IsHidden = true; SourceVersion = sourceVersion; UpdatedAtUtc = now; Version++;
    }
    private void Apply(SearchDocumentContract source)
    {
        if (source.Id == Guid.Empty || source.OwnerId == Guid.Empty || string.IsNullOrWhiteSpace(source.Title) ||
            string.IsNullOrWhiteSpace(source.DeepLink)) throw new DomainRuleException("search.document_invalid", "Arama belgesi geçersiz.");
        Type = source.Type; OwnerId = source.OwnerId; Title = source.Title.Trim()[..Math.Min(source.Title.Trim().Length, 200)];
        Body = source.Body.Trim()[..Math.Min(source.Body.Trim().Length, 10_000)];
        Tags = source.Tags.Select(x => x.Trim().TrimStart('#').ToLowerInvariant()).Where(x => x.Length > 0).Distinct().Take(50).ToArray();
        Visibility = source.Visibility; IsHidden = source.IsHidden; IsDeleted = false; DeepLink = source.DeepLink;
        UpdatedAtUtc = source.UpdatedAtUtc; SourceVersion = source.SourceVersion; Version++;
    }
}

public sealed class RecentSearch
{
    private RecentSearch() { Query = string.Empty; }
    public RecentSearch(Guid userId, string query, DateTimeOffset now) { UserId = userId; Query = Normalize(query); SearchedAtUtc = now; Count = 1; }
    public Guid UserId { get; private set; }
    public string Query { get; private set; }
    public DateTimeOffset SearchedAtUtc { get; private set; }
    public int Count { get; private set; }
    public void Touch(DateTimeOffset now) { SearchedAtUtc = now; Count++; }
    public static string Normalize(string query) { var value = query.Trim().ToLowerInvariant(); if (value.Length is < 2 or > 100) throw new DomainRuleException("search.query_invalid", "Arama sorgusu 2-100 karakter olmalıdır."); return value; }
}
