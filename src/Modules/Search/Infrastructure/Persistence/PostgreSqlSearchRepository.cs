using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using ZosyalMedya.Modules.Search.Application.Ports;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Search.Domain.Documents;

namespace ZosyalMedya.Modules.Search.Infrastructure.Persistence;

public sealed class PostgreSqlSearchRepository(SearchDbContext db) : ISearchRepository
{
    public async Task UpsertAsync(SearchDocumentContract source, CancellationToken cancellationToken = default)
    {
        var current = await db.Documents.SingleOrDefaultAsync(x => x.Id == new SearchDocumentId(source.Id) && x.Type == source.Type,
            cancellationToken);
        if (current is null) db.Documents.Add(SearchDocument.Create(source));
        else current.Refresh(source);
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    public async Task RemoveAsync(SearchDocumentType type, Guid id, long sourceVersion, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var current = await db.Documents.SingleOrDefaultAsync(x => x.Id == new SearchDocumentId(id) && x.Type == type,
            cancellationToken);
        if (current is null) return;
        current.Remove(sourceVersion, now);
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    public async Task<IReadOnlyList<SearchCandidate>> SearchAsync(string query, Guid? viewerId,
        IReadOnlySet<Guid> followedOwnerIds, SearchDocumentType? type, int limit,
        CancellationToken cancellationToken = default)
    {
        await db.Database.OpenConnectionAsync(cancellationToken);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            SELECT "Id", "Type",
                   ts_rank("SearchVector", websearch_to_tsquery('simple', @query)) +
                   greatest(similarity("Title", @query), word_similarity(@query, "Title")) * 0.35 AS score
            FROM search.documents
            WHERE NOT "IsHidden" AND NOT "IsDeleted"
              AND (@type IS NULL OR "Type" = @type)
              AND ("Visibility" = 'Public' OR "OwnerId" = @viewer OR ("Visibility" = 'Followers' AND "OwnerId" = ANY(@following)))
              AND ("SearchVector" @@ websearch_to_tsquery('simple', @query) OR
                   "Title" % @query OR word_similarity(@query, "Title") >= 0.30)
            ORDER BY score DESC, "UpdatedAtUtc" DESC, "Id" ASC
            LIMIT @limit
            """;
        command.Parameters.Add(new NpgsqlParameter("query", query));
        command.Parameters.Add(new NpgsqlParameter("type", NpgsqlDbType.Text) { Value = type?.ToString() ?? (object)DBNull.Value });
        command.Parameters.Add(new NpgsqlParameter("viewer", viewerId ?? Guid.Empty));
        command.Parameters.Add(new NpgsqlParameter<Guid[]>("following", followedOwnerIds.ToArray()));
        command.Parameters.Add(new NpgsqlParameter("limit", limit));
        var ordered = new List<(Guid Id, SearchDocumentType Type, double Score)>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
                ordered.Add((reader.GetGuid(0), Enum.Parse<SearchDocumentType>(reader.GetString(1)), reader.GetDouble(2)));
        if (ordered.Count == 0) return [];
        var ids = ordered.Select(x => new SearchDocumentId(x.Id)).ToArray();
        var documents = await db.Documents.AsNoTracking().Where(x => ids.Contains(x.Id)).ToListAsync(cancellationToken);
        return ordered.Select(match =>
        {
            var document = documents.Single(x => x.Id.Value == match.Id && x.Type == match.Type);
            var matchedTags = document.Tags.Where(tag => tag.Contains(query, StringComparison.OrdinalIgnoreCase)).ToArray();
            return new SearchCandidate(document, Snippet(document.Body, query), match.Score, matchedTags);
        }).ToArray();
    }

    public async Task TrackRecentAsync(Guid userId, string query, DateTimeOffset now,
        CancellationToken cancellationToken = default)
    {
        var current = await db.RecentSearches.SingleOrDefaultAsync(x => x.UserId == userId && x.Query == query,
            cancellationToken);
        if (current is null) db.Add(new RecentSearch(userId, query, now)); else current.Touch(now);
        await db.SaveChangesAsync(cancellationToken);
        db.ChangeTracker.Clear();
    }

    public async Task<IReadOnlyList<string>> ListRecentAsync(Guid userId, int limit,
        CancellationToken cancellationToken = default) => await db.RecentSearches.AsNoTracking().Where(x => x.UserId == userId)
        .OrderByDescending(x => x.SearchedAtUtc).ThenBy(x => x.Query).Select(x => x.Query).Take(limit).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<(string Tag, long Score)>> TrendingTagsAsync(DateTimeOffset since, int limit,
        CancellationToken cancellationToken = default)
    {
        await db.Database.OpenConnectionAsync(cancellationToken);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            SELECT tag, count(*)::bigint AS score
            FROM search.documents, unnest("Tags") AS tag
            WHERE NOT "IsHidden" AND NOT "IsDeleted" AND "Visibility" = 'Public' AND "UpdatedAtUtc" >= @since
            GROUP BY tag ORDER BY score DESC, tag ASC LIMIT @limit
            """;
        command.Parameters.Add(new NpgsqlParameter("since", since));
        command.Parameters.Add(new NpgsqlParameter("limit", limit));
        var result = new List<(string, long)>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) result.Add((reader.GetString(0), reader.GetInt64(1)));
        return result;
    }

    private static string Snippet(string body, string query)
    {
        if (body.Length <= 180) return body;
        var index = body.IndexOf(query, StringComparison.OrdinalIgnoreCase);
        var start = Math.Max(0, index < 0 ? 0 : index - 60);
        var length = Math.Min(180, body.Length - start);
        return string.Concat(start > 0 ? "…" : string.Empty, body.AsSpan(start, length),
            start + 180 < body.Length ? "…" : string.Empty);
    }
}
