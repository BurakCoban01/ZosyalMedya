using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Application.Stories;
using ZosyalMedya.Modules.Stories.Domain.Stories;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Stories;

public sealed class StoryTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 14, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void StoryExpiresAfterExactlyTwentyFourHoursAndOnlyOwnerCanDelete()
    {
        var owner = Guid.NewGuid();
        var story = Story.Create(StoryId.New(), new(owner), Guid.NewGuid(), "  Gerçek an  ",
            StoryAudience.Public, Now);

        Assert.Equal("Gerçek an", story.Caption);
        Assert.Equal(Now.AddHours(24), story.ExpiresAtUtc);
        Assert.True(story.IsActive(Now.AddHours(24).AddTicks(-1)));
        Assert.False(story.IsActive(Now.AddHours(24)));
        Assert.Equal("stories.delete_forbidden",
            Assert.Throws<DomainRuleException>(() => story.Delete(new(Guid.NewGuid()), Now)).Code);

        story.Delete(new(owner), Now.AddMinutes(1));
        Assert.Equal(StoryStatus.Deleted, story.Status);
        Assert.Empty(story.Caption);
        Assert.False(story.IsActive(Now.AddMinutes(1)));
    }

    [Fact]
    public async Task VisibilityRechecksProfileAudienceRelationshipExpiryAndDeletion()
    {
        var owner = Guid.NewGuid(); var viewer = Guid.NewGuid(); var mediaId = Guid.NewGuid();
        var clock = new Clock(Now);
        var story = Story.Create(StoryId.New(), new(owner), mediaId, null, StoryAudience.CloseFriends, Now);
        var profiles = new Profiles(owner, isPrivate: true);
        var graph = new Graph(viewer, owner, following: true, closeFriend: true);
        var visibility = new StoryVisibility(profiles, graph, clock);

        Assert.False(await visibility.CanViewAsync(story, null, default));
        Assert.True(await visibility.CanViewAsync(story, viewer, default));
        var module = new StoriesModule(new Repository([story]), visibility, clock);
        Assert.True(await module.CanViewMediaAsync(mediaId, viewer));

        graph.Blocked = true;
        Assert.False(await visibility.CanViewAsync(story, viewer, default));
        graph.Blocked = false;
        clock.Now = Now.AddHours(24);
        Assert.False(await visibility.CanViewAsync(story, viewer, default));
        clock.Now = Now.AddHours(1);
        story.Delete(new(owner), clock.Now);
        Assert.False(await visibility.CanViewAsync(story, viewer, default));
    }

    [Fact]
    public async Task CreateRequiresReadyOwnerOwnedPrivateImageOrVideo()
    {
        var owner = Guid.NewGuid(); var mediaId = Guid.NewGuid(); var clock = new Clock(Now);
        var repository = new Repository([]); var profiles = new Profiles(owner);

        var valid = await new CreateStoryHandler(repository,
            new Media(new(mediaId, owner, "image/png", 10, "Private", "Ready", null)), profiles, clock)
            .HandleAsync(owner, mediaId, "An", StoryAudience.Followers, default);
        var publicMedia = await new CreateStoryHandler(repository,
            new Media(new(mediaId, owner, "image/png", 10, "Public", "Ready", null)), profiles, clock)
            .HandleAsync(owner, mediaId, null, StoryAudience.Public, default);
        var document = await new CreateStoryHandler(repository,
            new Media(new(mediaId, owner, "application/pdf", 10, "Private", "Ready", null)), profiles, clock)
            .HandleAsync(owner, mediaId, null, StoryAudience.Public, default);
        repository.ThrowConflict = true;
        var duplicateMedia = new Media(new(mediaId, owner, "image/png", 10, "Private", "Ready", null));
        var duplicate = await new CreateStoryHandler(repository,
            duplicateMedia, profiles, clock)
            .HandleAsync(owner, mediaId, null, StoryAudience.Public, default);

        Assert.True(valid.IsSuccess);
        Assert.Equal(Now.AddHours(24), valid.Value!.ExpiresAtUtc);
        Assert.Equal("stories.media_visibility_invalid", publicMedia.Error.Code);
        Assert.Equal("stories.media_type_invalid", document.Error.Code);
        Assert.Equal("stories.media_conflict", duplicate.Error.Code);
        Assert.True(duplicateMedia.Released);
        Assert.Equal("stories.audience_invalid", Assert.Throws<DomainRuleException>(() =>
            Story.Create(StoryId.New(), new(owner), mediaId, null, (StoryAudience)99, Now)).Code);
    }

    [Fact]
    public async Task InvisibleHistoryScanIsBoundedAndReturnsRawContinuation()
    {
        var owner = Guid.NewGuid(); var viewer = Guid.NewGuid();
        var stories = Enumerable.Range(0, 200).Select(index => Story.Create(StoryId.New(), new(owner), Guid.NewGuid(),
            null, StoryAudience.Public, Now.AddMinutes(-index))).ToArray();
        var repository = new Repository(stories);
        var handler = new ListStoriesHandler(repository,
            new StoryVisibility(new Profiles(owner), new Graph(viewer, owner, blocked: true), new Clock(Now.AddMinutes(1))),
            new Profiles(owner), new Clock(Now.AddMinutes(1)));

        var page = await handler.ActiveAsync(viewer, 20, null, default);

        Assert.Empty(page.Items);
        Assert.NotNull(page.NextCursor);
        Assert.Equal(5, repository.PageCalls);
        await Assert.ThrowsAsync<DomainRuleException>(() => handler.ActiveAsync(viewer, 20,
            Convert.ToBase64String("1|00000000-0000-0000-0000-000000000001|extra"u8.ToArray()), default));
    }

    [Fact]
    public async Task DeleteTombstonesBeforeReleasingTheMatchingMediaClaim()
    {
        var owner = Guid.NewGuid(); var mediaId = Guid.NewGuid(); var clock = new Clock(Now);
        var story = Story.Create(StoryId.New(), new(owner), mediaId, null, StoryAudience.Public, Now);
        var repository = new Repository([story]);
        var media = new Media(new(mediaId, owner, "image/png", 10, "Private", "Ready", null));

        var result = await new DeleteStoryHandler(repository, media, clock)
            .HandleAsync(story.Id.Value, owner, default);

        Assert.True(result.IsSuccess);
        Assert.Equal(StoryStatus.Deleted, story.Status);
        Assert.True(media.Released);
    }

    private sealed class Clock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset Now { get; set; } = now;
        public DateTimeOffset UtcNow => Now;
    }

    private sealed class Media(MediaAccess? value) : IMediaModule
    {
        public bool Released { get; private set; }
        public Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId,
            CancellationToken cancellationToken = default) => Task.FromResult(value);
        public Task<MediaStoryClaim> ClaimForStoryAsync(Guid mediaId, Guid ownerId, Guid storyId,
            DateTimeOffset expiresAtUtc, CancellationToken cancellationToken = default)
        {
            if (value is null || value.MediaId != mediaId || value.OwnerId != ownerId || value.Status != "Ready")
                return Task.FromResult(new MediaStoryClaim(null, "media.story_not_ready", "Medya hazır değil."));
            if (value.Visibility != "Private")
                return Task.FromResult(new MediaStoryClaim(null, "media.story_visibility_invalid", "Medya özel değil."));
            if (!value.ContentType.StartsWith("image/", StringComparison.Ordinal) &&
                !value.ContentType.StartsWith("video/", StringComparison.Ordinal))
                return Task.FromResult(new MediaStoryClaim(null, "media.story_type_invalid", "Medya türü geçersiz."));
            return Task.FromResult(new MediaStoryClaim(value));
        }
        public Task<bool> ReleaseStoryClaimAsync(Guid mediaId, Guid ownerId, Guid storyId,
            CancellationToken cancellationToken = default) { Released = true; return Task.FromResult(true); }
    }

    private sealed class Profiles(Guid ownerId, bool isPrivate = false) : IProfilesModule
    {
        private ProfileLookup Profile => new(ownerId, "hikaye_sahibi", "Hikâye Sahibi", isPrivate, null, false);
        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid candidate, CancellationToken cancellationToken = default) =>
            Task.FromResult<ProfileLookup?>(candidate == ownerId ? Profile : null);
        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds,
            CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyDictionary<Guid, ProfileLookup>>(
            ownerIds.Contains(ownerId) ? new Dictionary<Guid, ProfileLookup> { [ownerId] = Profile } : new Dictionary<Guid, ProfileLookup>());
    }

    private sealed class Graph(Guid viewer, Guid owner, bool following = false, bool closeFriend = false,
        bool blocked = false) : ISocialGraphModule
    {
        public bool Blocked { get; set; } = blocked;
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId,
            CancellationToken cancellationToken = default)
        {
            var viewerToOwner = actorId == viewer && targetId == owner;
            var ownerToViewer = actorId == owner && targetId == viewer;
            return Task.FromResult(new RelationshipLookup(actorId, targetId,
                viewerToOwner && following, Blocked, false, false, ownerToViewer && closeFriend));
        }
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId,
            CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class Repository(IEnumerable<Story> seed) : IStoryRepository
    {
        private readonly List<Story> values = seed.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id).ToList();
        public int PageCalls { get; private set; }
        public bool ThrowConflict { get; set; }
        public Task<IReadOnlyList<Story>> ListPageAsync(StoryPageQuery query,
            CancellationToken cancellationToken = default)
        {
            PageCalls++;
            var result = values.Where(x => x.Status == StoryStatus.Active && x.ExpiresAtUtc > query.Now &&
                (!query.OwnerId.HasValue || x.OwnerId == query.OwnerId.Value) &&
                (!query.BeforeTime.HasValue || x.CreatedAtUtc < query.BeforeTime.Value ||
                 x.CreatedAtUtc == query.BeforeTime.Value && x.Id.Value.CompareTo(query.BeforeId!.Value.Value) > 0))
                .Take(query.Limit).ToArray();
            return Task.FromResult<IReadOnlyList<Story>>(result);
        }
        public Task<Story?> FindActiveByMediaAsync(Guid mediaId, DateTimeOffset now,
            CancellationToken cancellationToken = default) => Task.FromResult<Story?>(values.SingleOrDefault(x =>
            x.MediaId == mediaId && x.Status == StoryStatus.Active && x.ExpiresAtUtc > now));
        public Task<Story?> SelectAsync(Expression<Func<Story, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult<Story?>(values.SingleOrDefault(predicate.Compile()));
        public Task<IReadOnlyList<Story>> ListByFilterAsync(Expression<Func<Story, bool>> predicate,
            QueryOptions<Story>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Story>>(values.Where(predicate.Compile()).Take(options?.BoundedLimit ?? 50).ToArray());
        public Task<StoryId> CreateAsync(Story entity, CancellationToken cancellationToken = default)
        {
            if (ThrowConflict) throw new PersistenceConflictException("stories.media_conflict", "Medya kullanımda.");
            values.Add(entity); return Task.FromResult(entity.Id);
        }
        public Task<bool> UpdateAsync(Expression<Func<Story, bool>> predicate, Story replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<long> DeleteByFilterAsync(Expression<Func<Story, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult(0L);
    }
}
