using ZosyalMedya.Modules.Feed.Application.Feeds;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Feed;

public sealed class ProfileFeedVisibilityTests
{
    [Fact]
    public async Task PrivateProfileTimelineIsEmptyForAnUnrelatedViewer()
    {
        var owner = Guid.NewGuid();
        var handler = new GetFeedHandler(null!, new GraphStub(false), null!, null!,
            new ProfilesStub(new(owner, "private_user", "Private User", true, null, false)), null!, null!, TimeProvider.System);

        var page = await handler.HandleAsync(FeedKind.Profile, Guid.NewGuid(), 20, null, owner, default);

        Assert.Empty(page.Items);
        Assert.Null(page.NextCursor);
        Assert.Equal("chronological-profile", page.Strategy);
    }

    [Fact]
    public async Task MissingProfileIdDoesNotFallBackToTheFollowingFeed()
    {
        var handler = new GetFeedHandler(null!, new GraphStub(false), null!, null!, new ProfilesStub(null), null!, null!, TimeProvider.System);

        var page = await handler.HandleAsync(FeedKind.Profile, Guid.NewGuid(), 20, null, null, default);

        Assert.Empty(page.Items);
        Assert.Equal("chronological-profile", page.Strategy);
    }

    private sealed class ProfilesStub(ProfileLookup? profile) : IProfilesModule
    {
        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(profile?.OwnerId == ownerId ? profile : null);
        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class GraphStub(bool isFollowing) : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, isFollowing, false, false, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }
}
