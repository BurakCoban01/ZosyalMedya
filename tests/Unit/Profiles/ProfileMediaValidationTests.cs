using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Profiles.Application.Profiles;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Profiles;

public sealed class ProfileMediaValidationTests
{
    private static readonly Guid Owner = Guid.NewGuid();

    [Fact]
    public async Task UpdateRejectsForeignOrMissingProfileMediaBeforePersistence()
    {
        var id = Guid.NewGuid();
        var handler = new UpdateMyProfileHandler(null!, null!, null!, new MediaStub(new(id, Guid.NewGuid(), "image/png", 10, "Public", "Ready", null)));

        var result = await handler.HandleAsync(Command(id, null, false), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("profiles.media_invalid", result.Error.Code);
    }

    [Fact]
    public async Task UpdateRejectsVideoForAvatarOrCover()
    {
        var id = Guid.NewGuid();
        var handler = new UpdateMyProfileHandler(null!, null!, null!, new MediaStub(new(id, Owner, "video/mp4", 10, "Public", "Ready", null)));

        var result = await handler.HandleAsync(Command(id, null, false), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("profiles.media_invalid", result.Error.Code);
    }

    [Theory]
    [InlineData(false, "Followers")]
    [InlineData(true, "Public")]
    public async Task UpdateRejectsMediaWhoseAudienceDoesNotMatchProfile(bool isPrivate, string visibility)
    {
        var id = Guid.NewGuid();
        var handler = new UpdateMyProfileHandler(null!, null!, null!, new MediaStub(new(id, Owner, "image/webp", 10, visibility, "Ready", null)));

        var result = await handler.HandleAsync(Command(null, id, isPrivate), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("profiles.media_visibility_mismatch", result.Error.Code);
    }

    private static UpdateMyProfileCommand Command(Guid? profileMediaId, Guid? coverMediaId, bool isPrivate) =>
        new(new ProfileOwnerId(Owner), "demo_user", "Demo User", null, null, null, null, profileMediaId,
            coverMediaId, isPrivate, ProfileTheme.System, ProfileLanguage.Turkish, false);

    private sealed class MediaStub(MediaAccess? access) : IMediaModule
    {
        public Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId,
            CancellationToken cancellationToken = default) => Task.FromResult(access);
    }
}
