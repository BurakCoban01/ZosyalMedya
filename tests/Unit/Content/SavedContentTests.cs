using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Domain.Saved;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Content;
public sealed class SavedContentTests
{
    [Fact]
    public void CollectionNameIsNormalizedAndBounded()
    {
        var item = SavedContent.Create(SavedContentId.New(), Guid.NewGuid(), PostId.New(), "  Okuma  ", DateTimeOffset.UtcNow);
        Assert.Equal("Okuma", item.Collection);
        Assert.Equal("saved.collection_invalid", Assert.Throws<DomainRuleException>(() =>
            SavedContent.Create(SavedContentId.New(), Guid.NewGuid(), PostId.New(), new string('x', 81), DateTimeOffset.UtcNow)).Code);
    }
}
