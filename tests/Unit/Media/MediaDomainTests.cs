using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Domain.Assets;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Media;

public sealed class MediaDomainTests
{
    [Fact]
    public void LifecycleProtectsOwnerSizeAndState()
    {
        var now = new DateTimeOffset(2026, 7, 12, 12, 0, 0, TimeSpan.Zero);
        var owner = new MediaOwnerId(Guid.NewGuid());
        var asset = MediaAsset.Initiate(MediaId.New(), owner, "../profil.png", "image/png", 128,
            MediaVisibility.Private, "owner/id/original", 1024, now);
        Assert.Equal("profil.png", asset.OriginalFileName);
        Assert.Throws<DomainRuleException>(() => asset.BeginProcessing(new(Guid.NewGuid()), 128, "hash", now));
        Assert.Throws<DomainRuleException>(() => asset.BeginProcessing(owner, 127, "hash", now));
        asset.BeginProcessing(owner, 128, "hash", now);
        var deleteError = Assert.Throws<DomainRuleException>(() => asset.Delete(owner, now));
        Assert.Equal("media.processing_conflict", deleteError.Code);
        asset.Complete(owner, [MediaVariant.Create("w320.webp", "owner/id/w320.webp", "image/webp", 32, 4, 4)], now);
        Assert.Equal(MediaStatus.Ready, asset.Status);
        Assert.Throws<DomainRuleException>(() => asset.BeginProcessing(owner, 128, "hash", now));
    }
}
