namespace ZosyalMedya.Modules.Media.Contracts;

public sealed record MediaAccess(Guid MediaId, Guid OwnerId, string ContentType, long Size, string Visibility,
    string Status, string? Url);
public sealed record MediaStoryClaim(MediaAccess? Media, string? ErrorCode = null, string? ErrorMessage = null);

public interface IMediaModule
{
    Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId,
        CancellationToken cancellationToken = default);
    Task<MediaStoryClaim> ClaimForStoryAsync(Guid mediaId, Guid ownerId, Guid storyId, DateTimeOffset expiresAtUtc,
        CancellationToken cancellationToken = default) => Task.FromResult(new MediaStoryClaim(null,
        "media.story_claim_unsupported", "Hikâye medya talebi desteklenmiyor."));
    Task<bool> ReleaseStoryClaimAsync(Guid mediaId, Guid ownerId, Guid storyId,
        CancellationToken cancellationToken = default) => Task.FromResult(false);
}

public interface IMediaAccessGrantProvider
{
    Task<bool> CanViewAsync(Guid mediaId, Guid? viewerId,
        CancellationToken cancellationToken = default);
}
