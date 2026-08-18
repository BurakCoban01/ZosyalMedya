using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Domain.Posts;

namespace ZosyalMedya.Modules.Content.Domain.Saved;

public readonly record struct SavedContentId(Guid Value) { public static SavedContentId New() => new(Guid.NewGuid()); }

public sealed class SavedContent : AggregateRoot<SavedContentId>
{
    private SavedContent() : base(default) { Collection = string.Empty; }
    private SavedContent(SavedContentId id, Guid ownerId, PostId postId, string collection, DateTimeOffset now) : base(id)
    { OwnerId = ownerId; PostId = postId; Collection = NormalizeCollection(collection); CreatedAtUtc = now; Version = 1; }
    public Guid OwnerId { get; private set; }
    public PostId PostId { get; private set; }
    public string Collection { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public static SavedContent Create(SavedContentId id, Guid ownerId, PostId postId, string? collection, DateTimeOffset now)
    {
        if (ownerId == Guid.Empty || postId.Value == Guid.Empty) throw new DomainRuleException("saved.reference_invalid", "Kaydedilen içerik referansı geçersiz.");
        return new(id, ownerId, postId, collection ?? "Kaydedilenler", now);
    }
    private static string NormalizeCollection(string value)
    { var clean = value.Trim(); if (clean.Length is 0 or > 80) throw new DomainRuleException("saved.collection_invalid", "Koleksiyon adı 1-80 karakter olmalıdır."); return clean; }
}
