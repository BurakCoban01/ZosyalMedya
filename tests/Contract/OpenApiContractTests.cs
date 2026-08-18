using Xunit;

namespace ZosyalMedya.Tests.Contract;
public sealed class OpenApiContractTests
{
    private static readonly string Root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../"));
    [Fact]
    public void CriticalProductSurfacesAreVersionedAndGenerateTypedFunctions()
    {
        var contract=File.ReadAllText(Path.Combine(Root,"contracts/openapi/api-v1.yaml"));
        string[] paths=["/api/v1/identity/register","/api/v1/system/public-demo","/api/v1/identity/demo-mailbox","/api/v1/feed/{kind}","/api/v1/messaging/conversations","/api/v1/notifications/","/api/v1/questions/{id}","/api/v1/communities/","/api/v1/communities/{slug}","/api/v1/communities/{id}/change","/api/v1/media/","/api/v1/media/{id}/download","/api/v1/media/{id}","/api/v1/stories/","/api/v1/stories/profile/{ownerId}","/api/v1/stories/{id}","/api/v1/search/","/api/v1/moderation/reports","/api/v1/administration/configuration/dashboard"];
        foreach(var path in paths)Assert.Contains(path,contract,StringComparison.Ordinal);
        Assert.DoesNotContain("SigningKey",contract,StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("PasswordHash",contract,StringComparison.OrdinalIgnoreCase);
        Assert.Contains("'204': { description: Visible content has no poll }",contract,StringComparison.Ordinal);
        var createStory=contract[contract.IndexOf("operationId: createStory",StringComparison.Ordinal)..contract.IndexOf("/api/v1/stories/profile/{ownerId}",StringComparison.Ordinal)];
        var deleteStory=contract[contract.IndexOf("operationId: deleteStory",StringComparison.Ordinal)..contract.IndexOf("/api/v1/search/",StringComparison.Ordinal)];
        Assert.Contains("'401':",createStory,StringComparison.Ordinal);
        Assert.Contains("'401':",deleteStory,StringComparison.Ordinal);
        var deleteMedia=contract[contract.IndexOf("operationId: deleteMedia",StringComparison.Ordinal)..contract.IndexOf("/api/v1/stories/",StringComparison.Ordinal)];
        Assert.Contains("'409':",deleteMedia,StringComparison.Ordinal);
        string[] generated=["identity/read-public-demo-mailbox.ts","system/get-public-demo-status.ts","feed/get-feed.ts","questions/get-question.ts","communities/get-community-by-slug.ts","communities/change-community.ts","messaging/send-message.ts","media/upload-media-content.ts","media/download-media.ts","media/delete-media.ts","stories/create-story.ts","stories/list-active-stories.ts","stories/list-profile-stories.ts","stories/get-story.ts","stories/delete-story.ts","search/search.ts","moderation/create-moderation-report.ts"];
        foreach(var relative in generated)Assert.True(File.Exists(Path.Combine(Root,"packages/api-client/src/generated/fn",relative)),relative);
    }
}
