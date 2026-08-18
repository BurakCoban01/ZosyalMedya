using System.Globalization;
using System.Text;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Contracts;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Modules.Stories.Application.Stories;

public sealed record StoryAuthorSummary(Guid OwnerId, string Handle, string DisplayName, Guid? ProfileMediaId,
    bool IsVerified);
public sealed record StoryView(Guid Id, Guid OwnerId, Guid MediaId, string Caption, StoryAudience Audience,
    StoryStatus Status, StoryAuthorSummary Author, DateTimeOffset CreatedAtUtc, DateTimeOffset ExpiresAtUtc,
    long Version);
public sealed record StoryPage(IReadOnlyList<StoryView> Items, string? NextCursor);

public sealed class CreateStoryHandler(IStoryRepository stories, IMediaModule media, IProfilesModule profiles, IClock clock)
{
    public async Task<Result<StoryView>> HandleAsync(Guid ownerId, Guid mediaId, string? caption,
        StoryAudience audience, CancellationToken token)
    {
        var profile = await profiles.FindByOwnerIdAsync(ownerId, token);
        if (profile is null) return Result.Failure<StoryView>("stories.owner_not_found", "Hikâye sahibi profil bulunamadı.");
        Story story;
        try
        {
            story = Story.Create(StoryId.New(), new(ownerId), mediaId, caption, audience, clock.UtcNow);
        }
        catch (DomainRuleException exception) { return Result.Failure<StoryView>(exception.Code, exception.Message); }
        var claim = await media.ClaimForStoryAsync(mediaId, ownerId, story.Id.Value, story.ExpiresAtUtc, token);
        if (claim.Media is null)
        {
            var conflict = claim.ErrorCode is "media.story_claim_conflict" or "media.concurrency_conflict";
            var errorCode = claim.ErrorCode switch
            {
                "media.story_visibility_invalid" => "stories.media_visibility_invalid",
                "media.story_type_invalid" => "stories.media_type_invalid",
                _ when conflict => "stories.media_conflict",
                _ => "stories.media_invalid"
            };
            return Result.Failure<StoryView>(errorCode,
                claim.ErrorMessage ?? "Medya bulunamadı, hazır değil veya bu hesaba ait değil.");
        }
        var persisted = false;
        var releaseClaim = false;
        try
        {
            await stories.CreateAsync(story, token);
            persisted = true;
            return Result.Success(StoryMapper.Map(story, profile));
        }
        catch (PersistenceConflictException exception)
        {
            releaseClaim = true;
            return Result.Failure<StoryView>(exception.Code, exception.Message);
        }
        catch
        {
            try
            {
                releaseClaim = await stories.SelectAsync(x => x.Id == story.Id, CancellationToken.None) is null;
            }
            catch { releaseClaim = false; }
            throw;
        }
        finally
        {
            if (!persisted && releaseClaim)
            {
                try { await media.ReleaseStoryClaimAsync(mediaId, ownerId, story.Id.Value, CancellationToken.None); }
                catch { /* A retained claim is safer than deleting media from an ambiguously committed Story. */ }
            }
        }
    }
}

public sealed class GetStoryHandler(IStoryRepository stories, StoryVisibility visibility, IProfilesModule profiles)
{
    public async Task<Result<StoryView>> HandleAsync(Guid id, Guid? viewerId, CancellationToken token)
    {
        var story = await stories.SelectAsync(x => x.Id == new StoryId(id), token);
        if (story is null || !await visibility.CanViewAsync(story, viewerId, token))
            return Result.Failure<StoryView>("stories.not_found", "Hikâye bulunamadı veya artık görünür değil.");
        var profile = await profiles.FindByOwnerIdAsync(story.OwnerId.Value, token);
        return profile is null ? Result.Failure<StoryView>("stories.not_found", "Hikâye bulunamadı veya artık görünür değil.")
            : Result.Success(StoryMapper.Map(story, profile));
    }
}

public sealed class ListStoriesHandler(IStoryRepository stories, StoryVisibility visibility, IProfilesModule profiles,
    IClock clock)
{
    public Task<StoryPage> ActiveAsync(Guid? viewerId, int limit, string? cursor, CancellationToken token) =>
        ListAsync(null, viewerId, limit, cursor, token);

    public Task<StoryPage> ProfileAsync(Guid ownerId, Guid? viewerId, int limit, string? cursor,
        CancellationToken token) => ListAsync(new(ownerId), viewerId, limit, cursor, token);

    private async Task<StoryPage> ListAsync(StoryOwnerId? ownerId, Guid? viewerId, int requestedLimit,
        string? cursor, CancellationToken token)
    {
        var limit = Math.Clamp(requestedLimit, 1, 30);
        var (beforeTime, beforeId) = StoryCursor.Decode(cursor);
        var batchSize = Math.Min(Math.Max(limit * 2, 20), 100);
        var result = new List<StoryView>(limit);
        Story? lastScanned = null;
        var exhausted = false;
        for (var batch = 0; batch < 5 && result.Count < limit; batch++)
        {
            var candidates = await stories.ListPageAsync(new(ownerId, clock.UtcNow, beforeTime, beforeId, batchSize), token);
            var ownerIds = candidates.Select(x => x.OwnerId.Value).ToHashSet();
            var authorMap = ownerIds.Count == 0 ? new Dictionary<Guid, ProfileLookup>()
                : await profiles.FindByOwnerIdsAsync(ownerIds, token);
            foreach (var story in candidates)
            {
                lastScanned = story;
                if (authorMap.TryGetValue(story.OwnerId.Value, out var author) &&
                    await visibility.CanViewAsync(story, viewerId, token)) result.Add(StoryMapper.Map(story, author));
                if (result.Count == limit) break;
            }
            if (result.Count == limit) break;
            if (candidates.Count < batchSize) { exhausted = true; break; }
            beforeTime = candidates[^1].CreatedAtUtc; beforeId = candidates[^1].Id;
        }
        return new(result, exhausted || lastScanned is null ? null : StoryCursor.Encode(lastScanned));
    }
}

public sealed class DeleteStoryHandler(IStoryRepository stories, IMediaModule media, IClock clock)
{
    public async Task<Result<bool>> HandleAsync(Guid id, Guid actorId, CancellationToken token)
    {
        var story = await stories.SelectAsync(x => x.Id == new StoryId(id), token);
        if (story is null) return Result.Failure<bool>("stories.not_found", "Hikâye bulunamadı.");
        var version = story.Version;
        try { story.Delete(new(actorId), clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<bool>(exception.Code, exception.Message); }
        if (story.Version != version && !await stories.UpdateAsync(x => x.Id == story.Id, story, version, token))
            return Result.Failure<bool>("stories.concurrency_conflict", "Hikâye eşzamanlı güncellendi.");
        return await media.ReleaseStoryClaimAsync(story.MediaId, story.OwnerId.Value, story.Id.Value, token)
            ? Result.Success(true)
            : Result.Failure<bool>("stories.media_release_failed", "Hikâye silindi; medya bağı daha sonra yeniden bırakılmalı.");
    }
}

public sealed class StoryVisibility(IProfilesModule profiles, ISocialGraphModule graph, IClock clock)
{
    public async Task<bool> CanViewAsync(Story story, Guid? viewerId, CancellationToken token)
    {
        if (!story.IsActive(clock.UtcNow)) return false;
        if (viewerId == story.OwnerId.Value) return true;
        var profile = await profiles.FindByOwnerIdAsync(story.OwnerId.Value, token);
        if (profile is null) return false;
        if (!viewerId.HasValue) return story.Audience == StoryAudience.Public && !profile.IsPrivate;
        var viewerToOwner = await graph.GetAsync(viewerId.Value, story.OwnerId.Value, token);
        if (viewerToOwner.IsBlocked || viewerToOwner.IsBlockedByTarget || viewerToOwner.IsMuted) return false;
        if (profile.IsPrivate && !viewerToOwner.IsFollowing) return false;
        if (story.Audience == StoryAudience.Public) return true;
        if (story.Audience == StoryAudience.Followers) return viewerToOwner.IsFollowing;
        var ownerToViewer = await graph.GetAsync(story.OwnerId.Value, viewerId.Value, token);
        return !ownerToViewer.IsBlocked && !ownerToViewer.IsBlockedByTarget && ownerToViewer.IsCloseFriend;
    }
}

public sealed class StoriesModule(IStoryRepository stories, StoryVisibility visibility, IClock clock) : IStoriesModule
{
    public async Task<bool> CanViewMediaAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default)
    {
        var story = await stories.FindActiveByMediaAsync(mediaId, clock.UtcNow, cancellationToken);
        return story is not null && await visibility.CanViewAsync(story, viewerId, cancellationToken);
    }

}

internal static class StoryMapper
{
    public static StoryView Map(Story story, ProfileLookup profile) => new(story.Id.Value, story.OwnerId.Value,
        story.MediaId, story.Caption, story.Audience, story.Status,
        new(profile.OwnerId, profile.Handle, profile.DisplayName, profile.ProfileMediaId, profile.IsVerified),
        story.CreatedAtUtc, story.ExpiresAtUtc, story.Version);
}

internal static class StoryCursor
{
    public static string Encode(Story story) => Convert.ToBase64String(Encoding.UTF8.GetBytes(
        $"{story.CreatedAtUtc.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{story.Id.Value:D}"));
    public static (DateTimeOffset? Time, StoryId? Id) Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, null);
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|');
            if (parts.Length != 2) throw new FormatException();
            return (new DateTimeOffset(long.Parse(parts[0], CultureInfo.InvariantCulture), TimeSpan.Zero),
                new StoryId(Guid.Parse(parts[1])));
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException)
        { throw new DomainRuleException("stories.cursor_invalid", "Hikâye sayfalama imleci geçersiz."); }
    }
}
