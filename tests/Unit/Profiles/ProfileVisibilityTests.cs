using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Application.Profiles;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Profiles;

public sealed class ProfileVisibilityTests
{
    private static readonly Guid OwnerId = Guid.NewGuid();
    private static readonly Guid ViewerId = Guid.NewGuid();

    [Fact]
    public async Task FollowingViewerCanReadPrivateProfile()
    {
        var handler = CreateHandler(isPrivate: true, isFollowing: true);

        var result = await handler.ByHandleAsync("private_user", new(ViewerId), CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task UnrelatedViewerCannotReadPrivateProfile()
    {
        var handler = CreateHandler(isPrivate: true, isFollowing: false);

        var result = await handler.ByHandleAsync("private_user", new(ViewerId), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("profiles.not_visible", result.Error!.Code);
    }

    [Fact]
    public async Task EitherDirectionBlockHidesEvenPublicProfile()
    {
        var handler = CreateHandler(isPrivate: false, isFollowing: false, isBlockedByTarget: true);

        var result = await handler.ByHandleAsync("private_user", new(ViewerId), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("profiles.not_visible", result.Error!.Code);
    }

    private static GetProfileHandler CreateHandler(bool isPrivate, bool isFollowing, bool isBlockedByTarget = false)
    {
        var profile = Profile.Create(ProfileId.New(), new(OwnerId), "private_user", "Private User", DateTimeOffset.UtcNow);
        profile.Update(profile.Handle, profile.DisplayName, null, null, null, null, null, null, isPrivate,
            ProfileTheme.System, ProfileLanguage.Turkish, false, DateTimeOffset.UtcNow);
        return new(new ProfileRepositoryStub(profile), new GraphStub(isFollowing, isBlockedByTarget));
    }

    private sealed class GraphStub(bool isFollowing, bool isBlockedByTarget) : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, isFollowing, false, isBlockedByTarget, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class ProfileRepositoryStub(Profile profile) : IProfileRepository
    {
        public Task<Profile?> SelectAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default) =>
            Task.FromResult<Profile?>(predicate.Compile()(profile) ? profile : null);
        public Task<IReadOnlyList<Profile>> ListByFilterAsync(Expression<Func<Profile, bool>> predicate, QueryOptions<Profile>? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
        public Task<ProfileId> CreateAsync(Profile entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Profile, bool>> predicate, Profile replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Profile, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
