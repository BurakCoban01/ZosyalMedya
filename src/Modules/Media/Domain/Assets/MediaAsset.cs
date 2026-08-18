using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Media.Domain.Assets;

public readonly record struct MediaId(Guid Value)
{
    public static MediaId New() => new(Guid.NewGuid());
}

public readonly record struct MediaOwnerId(Guid Value);
public enum MediaStatus { Pending, Processing, Ready, Quarantined, Deleted }
public enum MediaVisibility { Private, Followers, Public }

public sealed class MediaVariant
{
    private MediaVariant() { Name = StorageKey = ContentType = string.Empty; }
    private MediaVariant(string name, string storageKey, string contentType, long size, int? width, int? height)
    {
        Name = name; StorageKey = storageKey; ContentType = contentType; Size = size; Width = width; Height = height;
    }
    public string Name { get; private set; }
    public string StorageKey { get; private set; }
    public string ContentType { get; private set; }
    public long Size { get; private set; }
    public int? Width { get; private set; }
    public int? Height { get; private set; }
    public static MediaVariant Create(string name, string storageKey, string contentType, long size, int? width, int? height)
    {
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(storageKey) || size < 1)
            throw new DomainRuleException("media.variant_invalid", "Medya varyantı geçersiz.");
        return new(name.Trim(), storageKey, contentType, size, width, height);
    }
}

public sealed class MediaAsset : AggregateRoot<MediaId>
{
    private List<MediaVariant> _variants = [];
    private MediaAsset() : base(default) { OriginalFileName = ContentType = StorageKey = Sha256 = QuarantineReason = string.Empty; }
    private MediaAsset(MediaId id, MediaOwnerId owner, string fileName, string contentType, long expectedSize,
        MediaVisibility visibility, string storageKey, DateTimeOffset now) : base(id)
    {
        OwnerId = owner; OriginalFileName = ValidateName(fileName); ContentType = ValidateType(contentType);
        ExpectedSize = expectedSize; ReservedStorageBytes = expectedSize;
        Visibility = visibility; StorageKey = storageKey; Status = MediaStatus.Pending;
        CreatedAtUtc = UpdatedAtUtc = now; PendingExpiresAtUtc = now.AddHours(1);
        Sha256 = QuarantineReason = string.Empty; Version = 1;
    }

    public MediaOwnerId OwnerId { get; private set; }
    public string OriginalFileName { get; private set; }
    public string ContentType { get; private set; }
    public long ExpectedSize { get; private set; }
    public long ActualSize { get; private set; }
    public long ReservedStorageBytes { get; private set; }
    public MediaVisibility Visibility { get; private set; }
    public string StorageKey { get; private set; }
    public string Sha256 { get; private set; }
    public MediaStatus Status { get; private set; }
    public string QuarantineReason { get; private set; }
    public IReadOnlyList<MediaVariant> Variants => _variants.AsReadOnly();
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public DateTimeOffset? PendingExpiresAtUtc { get; private set; }
    public DateTimeOffset? DeletedAtUtc { get; private set; }
    public Guid? StoryClaimId { get; private set; }
    public DateTimeOffset? StoryClaimExpiresAtUtc { get; private set; }

    public static MediaAsset Initiate(MediaId id, MediaOwnerId owner, string fileName, string contentType,
        long expectedSize, MediaVisibility visibility, string storageKey, long maxSize, DateTimeOffset now)
    {
        if (owner.Value == Guid.Empty || expectedSize < 1 || expectedSize > maxSize)
            throw new DomainRuleException("media.size_invalid", "Dosya boyutu izin verilen sınırda değil.");
        return new(id, owner, fileName, contentType, expectedSize, visibility, storageKey, now);
    }

    public void BeginProcessing(MediaOwnerId actor, long actualSize, string sha256, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status != MediaStatus.Pending) throw new DomainRuleException("media.state_invalid", "Medya yükleme beklemiyor.");
        if (actualSize != ExpectedSize) throw new DomainRuleException("media.size_mismatch", "Yüklenen boyut beyanla eşleşmiyor.");
        ActualSize = actualSize; Sha256 = sha256; Status = MediaStatus.Processing; UpdatedAtUtc = now; Version++;
    }

    public void Complete(MediaOwnerId actor, IReadOnlyList<MediaVariant> variants, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status != MediaStatus.Processing) throw new DomainRuleException("media.state_invalid", "Medya işlenebilir durumda değil.");
        _variants = variants.ToList(); Status = MediaStatus.Ready; PendingExpiresAtUtc = null; UpdatedAtUtc = now; Version++;
    }

    public void StageVariants(MediaOwnerId actor, IReadOnlyList<MediaVariant> variants, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status != MediaStatus.Processing)
            throw new DomainRuleException("media.state_invalid", "Medya işlenebilir durumda değil.");
        _variants = variants.ToList(); UpdatedAtUtc = now; Version++;
    }

    public void ReserveProcessedStorage(MediaOwnerId actor, long totalBytes, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status != MediaStatus.Processing || totalBytes < 1)
            throw new DomainRuleException("media.storage_reservation_invalid", "İşlenmiş medya rezervasyonu geçersiz.");
        ReservedStorageBytes = totalBytes;
        UpdatedAtUtc = now;
        Version++;
    }

    public void FailProcessing(string reason, DateTimeOffset now)
    {
        if (Status != MediaStatus.Processing) return;
        Status = MediaStatus.Quarantined;
        QuarantineReason = reason.Trim()[..Math.Min(reason.Trim().Length, 500)];
        UpdatedAtUtc = now; Version++;
    }

    public void Quarantine(string reason, DateTimeOffset now)
    {
        if (Status == MediaStatus.Deleted) return;
        Status = MediaStatus.Quarantined; QuarantineReason = reason.Trim()[..Math.Min(reason.Trim().Length, 500)];
        PendingExpiresAtUtc = null; UpdatedAtUtc = now; Version++;
    }

    public void ClaimForStory(MediaOwnerId actor, Guid storyId, DateTimeOffset expiresAtUtc, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status != MediaStatus.Ready)
            throw new DomainRuleException("media.story_not_ready", "Hikâye medyası hazır olmalıdır.");
        if (Visibility != MediaVisibility.Private)
            throw new DomainRuleException("media.story_visibility_invalid", "Hikâye medyası özel olmalıdır.");
        if (!ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) &&
            !ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
            throw new DomainRuleException("media.story_type_invalid", "Hikâye medyası görsel veya video olmalıdır.");
        if (storyId == Guid.Empty || expiresAtUtc <= now)
            throw new DomainRuleException("media.story_claim_invalid", "Hikâye medya talebi geçersiz.");
        if (StoryClaimId == storyId && StoryClaimExpiresAtUtc > now) return;
        if (StoryClaimId.HasValue && StoryClaimExpiresAtUtc > now)
            throw new DomainRuleException("media.story_claim_conflict", "Medya etkin bir hikâye tarafından kullanılıyor.");
        StoryClaimId = storyId; StoryClaimExpiresAtUtc = expiresAtUtc; UpdatedAtUtc = now; Version++;
    }

    public void ReleaseStoryClaim(MediaOwnerId actor, Guid storyId, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (StoryClaimId != storyId) return;
        StoryClaimId = null; StoryClaimExpiresAtUtc = null; UpdatedAtUtc = now; Version++;
    }

    public void Delete(MediaOwnerId actor, DateTimeOffset now)
    {
        EnsureOwner(actor);
        if (Status == MediaStatus.Deleted) return;
        if (Status == MediaStatus.Processing)
            throw new DomainRuleException("media.processing_conflict", "İşlenen medya şu anda silinemez.");
        if (StoryClaimId.HasValue && StoryClaimExpiresAtUtc > now)
            throw new DomainRuleException("media.reference_conflict", "Medya etkin bir içerik tarafından kullanılıyor.");
        StoryClaimId = null; StoryClaimExpiresAtUtc = null; Status = MediaStatus.Deleted;
        DeletedAtUtc = now; UpdatedAtUtc = now; Version++;
    }

    private void EnsureOwner(MediaOwnerId actor)
    {
        if (actor != OwnerId)
            throw new DomainRuleException("media.forbidden", "Medya yalnız sahibi tarafından değiştirilebilir.");
    }

    private static string ValidateName(string name)
    {
        var value = Path.GetFileName(name.Trim());
        if (value.Length is < 1 or > 255) throw new DomainRuleException("media.filename_invalid", "Dosya adı geçersiz.");
        return value;
    }

    private static string ValidateType(string type)
    {
        var value = type.Trim().ToLowerInvariant();
        if (value is not ("image/jpeg" or "image/png" or "image/webp" or "video/mp4"))
            throw new DomainRuleException("media.type_invalid", "Dosya türüne izin verilmiyor.");
        return value;
    }
}
