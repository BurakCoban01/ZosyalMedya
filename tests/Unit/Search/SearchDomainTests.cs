using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Search.Domain.Documents;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Search;

public sealed class SearchDomainTests
{
    [Fact]
    public void StaleIndexUpdatesCannotOverwriteNewerSourceVersion()
    {
        var id = Guid.NewGuid(); var owner = Guid.NewGuid(); var now = DateTimeOffset.UtcNow;
        var item = SearchDocument.Create(new(id, SearchDocumentType.Content, owner, "Yeni başlık", "Yeni gövde",
            ["Mimari", "mimari"], SearchVisibility.Public, false, $"/icerik/{id}", now, 4));
        item.Refresh(new(id, SearchDocumentType.Content, owner, "Eski başlık", "Eski gövde", [],
            SearchVisibility.Public, false, $"/icerik/{id}", now.AddMinutes(-1), 3));
        Assert.Equal("Yeni başlık", item.Title);
        Assert.Single(item.Tags);
        item.Remove(3, now);
        Assert.False(item.IsDeleted);
        item.Remove(5, now);
        Assert.True(item.IsDeleted);
    }
}
