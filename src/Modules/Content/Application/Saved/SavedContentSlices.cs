using System.Globalization;
using System.Text;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Domain.Saved;

namespace ZosyalMedya.Modules.Content.Application.Saved;

public sealed record SavedContentView(Guid Id, string Collection, ContentItem Content, DateTimeOffset SavedAtUtc);
public sealed record SavedContentPage(IReadOnlyList<SavedContentView> Items, string? NextCursor);

public sealed class SaveContentHandler(ISavedContentRepository saved, IContentModule content, IClock clock)
{
    public async Task<Result<bool>> SaveAsync(Guid ownerId, Guid postId, string? collection, CancellationToken token)
    {
        if (await content.GetVisibleAsync(postId, ownerId, token) is null)
            return Result.Failure<bool>("content.not_found", "İçerik bulunamadı veya görünür değil.");
        try
        {
            var item = SavedContent.Create(SavedContentId.New(), ownerId, new PostId(postId), collection, clock.UtcNow);
            if (await saved.SelectAsync(x => x.OwnerId == ownerId && x.PostId == item.PostId && x.Collection == item.Collection, token) is null)
                await saved.CreateAsync(item, token);
            return Result.Success(true);
        }
        catch (DomainRuleException exception) { return Result.Failure<bool>(exception.Code, exception.Message); }
    }
    public async Task<Result<bool>> RemoveAsync(Guid ownerId, Guid postId, string? collection, CancellationToken token)
    {
        var normalized = string.IsNullOrWhiteSpace(collection) ? "Kaydedilenler" : collection.Trim();
        await saved.DeleteByFilterAsync(x => x.OwnerId == ownerId && x.PostId == new PostId(postId) && x.Collection == normalized, token);
        return Result.Success(true);
    }
}

public sealed class ListSavedContentHandler(ISavedContentRepository saved, IContentModule content)
{
    public async Task<SavedContentPage> HandleAsync(Guid ownerId, string? collection, int limit, string? cursor, CancellationToken token)
    {
        limit = Math.Clamp(limit, 1, 50); var decoded = Decode(cursor);
        var records = await saved.ListPageAsync(new(ownerId, string.IsNullOrWhiteSpace(collection) ? null : collection.Trim(), decoded.Time, decoded.Id, limit * 2), token);
        var views = new List<SavedContentView>();
        foreach (var record in records)
        {
            var item = await content.GetVisibleAsync(record.PostId.Value, ownerId, token);
            if (item is not null) views.Add(new(record.Id.Value, record.Collection, item, record.CreatedAtUtc));
            if (views.Count == limit) break;
        }
        return new(views, views.Count == limit ? Encode(records[Math.Min(records.Count, limit) - 1]) : null);
    }
    private static string Encode(SavedContent item) => Convert.ToBase64String(Encoding.UTF8.GetBytes($"{item.CreatedAtUtc.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{item.Id.Value:D}"));
    private static (DateTimeOffset? Time, SavedContentId? Id) Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, null);
        try { var values = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|'); return (new DateTimeOffset(long.Parse(values[0], CultureInfo.InvariantCulture), TimeSpan.Zero), new SavedContentId(Guid.Parse(values[1]))); }
        catch (Exception exception) when (exception is FormatException or IndexOutOfRangeException) { throw new DomainRuleException("saved.cursor_invalid", "Kaydedilenler imleci geçersiz."); }
    }
}
