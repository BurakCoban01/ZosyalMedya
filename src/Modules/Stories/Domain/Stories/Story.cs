using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Stories.Domain.Stories;

public readonly record struct StoryId(Guid Value)
{
    public static StoryId New() => new(Guid.NewGuid());
    public override string ToString() => Value.ToString("D");
}

public readonly record struct StoryOwnerId(Guid Value);
public enum StoryAudience { Public, Followers, CloseFriends }
public enum StoryStatus { Active, Deleted }

public sealed class Story : AggregateRoot<StoryId>
{
    private Story() : base(default) { Caption = string.Empty; }
    private Story(StoryId id, StoryOwnerId ownerId, Guid mediaId, string caption, StoryAudience audience,
        DateTimeOffset now) : base(id)
    {
        OwnerId = ownerId; MediaId = mediaId; Caption = caption; Audience = audience; Status = StoryStatus.Active;
        CreatedAtUtc = now; ExpiresAtUtc = now.AddHours(24); UpdatedAtUtc = now; Version = 1;
    }

    public StoryOwnerId OwnerId { get; private set; }
    public Guid MediaId { get; private set; }
    public string Caption { get; private set; }
    public StoryAudience Audience { get; private set; }
    public StoryStatus Status { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset ExpiresAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }

    public static Story Create(StoryId id, StoryOwnerId ownerId, Guid mediaId, string? caption,
        StoryAudience audience, DateTimeOffset now)
    {
        if (id.Value == Guid.Empty || ownerId.Value == Guid.Empty || mediaId == Guid.Empty)
            throw new DomainRuleException("stories.identity_invalid", "Hikâye sahibi ve medyası gereklidir.");
        if (!Enum.IsDefined(audience))
            throw new DomainRuleException("stories.audience_invalid", "Hikâye hedef kitlesi geçersiz.");
        var cleanCaption = (caption ?? string.Empty).Trim();
        if (cleanCaption.Length > 500)
            throw new DomainRuleException("stories.caption_invalid", "Hikâye açıklaması en fazla 500 karakter olabilir.");
        return new(id, ownerId, mediaId, cleanCaption, audience, now);
    }

    public bool IsActive(DateTimeOffset now) => Status == StoryStatus.Active && ExpiresAtUtc > now;

    public void Delete(StoryOwnerId actorId, DateTimeOffset now)
    {
        if (actorId != OwnerId)
            throw new DomainRuleException("stories.delete_forbidden", "Yalnızca hikâye sahibi silebilir.");
        if (Status == StoryStatus.Deleted) return;
        Status = StoryStatus.Deleted; Caption = string.Empty; UpdatedAtUtc = now; Version++;
    }
}
