using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Profiles;

public sealed class ProfileTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void UpdateProtectsHandleAndWebsiteInvariants()
    {
        var profile = Profile.Create(ProfileId.New(), new ProfileOwnerId(Guid.NewGuid()), "deniz_1", "Deniz", Now);
        profile.Update("deniz.1", "Deniz Kaya", "Biyografi", "İstanbul", "Örnek", "https://example.test/path", null, null,
            true, ProfileTheme.Dark, ProfileLanguage.Turkish, true, Now.AddMinutes(1));
        Assert.Equal("DENIZ.1", profile.NormalizedHandle);
        Assert.True(profile.IsPrivate);
        Assert.Equal(ProfileTheme.Dark, profile.Theme);
        Assert.True(profile.CompletenessPercentage >= 50);
    }

    [Fact]
    public void InsecureWebsiteSchemeIsRejected()
    {
        var profile = Profile.Create(ProfileId.New(), new ProfileOwnerId(Guid.NewGuid()), "deniz_1", "Deniz", Now);
        var exception = Assert.Throws<DomainRuleException>(() => profile.Update("deniz_1", "Deniz", null, null, null,
            "http://example.test", null, null, false, ProfileTheme.System, ProfileLanguage.Turkish, false, Now));
        Assert.Equal("profiles.website_invalid", exception.Code);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("invalid handle")]
    [InlineData("invalid!")]
    public void InvalidHandleIsRejected(string handle)
    {
        var exception = Assert.Throws<DomainRuleException>(() =>
            Profile.Create(ProfileId.New(), new ProfileOwnerId(Guid.NewGuid()), handle, "Deniz", Now));
        Assert.Equal("profiles.handle_invalid", exception.Code);
    }
}
