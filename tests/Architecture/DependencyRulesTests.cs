using System.Reflection;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Application.Users.Register;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.Profiles.Application.Profiles;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using ZosyalMedya.Modules.SocialGraph.Application.Relationships;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.Questions.Application.Questions;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Reactions.Domain.Reactions;
using ZosyalMedya.Modules.Reactions.Application.Reactions;
using ZosyalMedya.Modules.Comments.Domain.Comments;
using ZosyalMedya.Modules.Comments.Application.Comments;
using ZosyalMedya.Modules.Feed.Domain.Ranking;
using ZosyalMedya.Modules.Feed.Application.Feeds;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Notifications.Domain.Inbox;
using ZosyalMedya.Modules.Notifications.Application.Inbox;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using ZosyalMedya.Modules.Communities.Application.Communities;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Stories.Domain.Stories;
using ZosyalMedya.Modules.Stories.Application.Stories;
using ZosyalMedya.Modules.Search.Domain.Documents;
using ZosyalMedya.Modules.Search.Application.Search;
using ZosyalMedya.Modules.Audit.Domain.Entries;
using ZosyalMedya.Modules.Audit.Application.Audit;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using ZosyalMedya.Modules.Moderation.Application.Cases;
using ZosyalMedya.Modules.Administration.Domain.Configuration;
using ZosyalMedya.Modules.Administration.Application.Configuration;
using Xunit;

namespace ZosyalMedya.Tests.Architecture;

public sealed class DependencyRulesTests
{
    private static readonly string[] ForbiddenDrivers =
    [
        "Microsoft.EntityFrameworkCore", "MongoDB.Driver", "StackExchange.Redis", "Microsoft.AspNetCore"
    ];

    [Fact]
    public void DomainHasNoFrameworkOrDriverReferences() =>
        AssertNoForbiddenReferences(typeof(UserAccount).Assembly);

    [Fact]
    public void ApplicationHasNoPersistenceDriverReferences() =>
        AssertNoForbiddenReferences(typeof(RegisterUserHandler).Assembly);

    [Fact]
    public void ProfilesDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Profile).Assembly);
        AssertNoForbiddenReferences(typeof(UpdateMyProfileHandler).Assembly);
    }

    [Fact]
    public void SocialGraphDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Relationship).Assembly);
        AssertNoForbiddenReferences(typeof(FollowHandler).Assembly);
    }

    [Fact]
    public void SocialGraphUsesOnlyProfilesPublicContract()
    {
        var references = typeof(FollowHandler).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.Profiles.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Profiles.Domain", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Profiles.Infrastructure", references);
    }

    [Fact]
    public void QuestionsDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Question).Assembly);
        AssertNoForbiddenReferences(typeof(AskQuestionHandler).Assembly);
    }

    [Fact]
    public void QuestionsUsesOnlyProfilesPublicContract()
    {
        var references = typeof(AskQuestionHandler).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.Profiles.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Profiles.Domain", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Profiles.Infrastructure", references);
    }

    [Fact]
    public void ContentDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Post).Assembly);
        AssertNoForbiddenReferences(typeof(CreatePostHandler).Assembly);
    }

    [Fact]
    public void ContentUsesOnlySocialGraphPublicContract()
    {
        var references = typeof(ContentModule).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.SocialGraph.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.SocialGraph.Domain", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.SocialGraph.Infrastructure", references);
    }

    [Fact]
    public void EngagementAndFeedLayersHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Reaction).Assembly); AssertNoForbiddenReferences(typeof(SetReactionHandler).Assembly);
        AssertNoForbiddenReferences(typeof(Comment).Assembly); AssertNoForbiddenReferences(typeof(CreateCommentHandler).Assembly);
        AssertNoForbiddenReferences(typeof(DeterministicRankingPolicy).Assembly); AssertNoForbiddenReferences(typeof(GetFeedHandler).Assembly);
    }

    [Fact]
    public void EngagementReferencesContentOnlyThroughContract()
    {
        foreach (var assembly in new[] { typeof(SetReactionHandler).Assembly, typeof(CreateCommentHandler).Assembly })
        {
            var references = assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
            Assert.Contains("ZosyalMedya.Modules.Content.Contracts", references);
            Assert.DoesNotContain("ZosyalMedya.Modules.Content.Domain", references);
            Assert.DoesNotContain("ZosyalMedya.Modules.Content.Infrastructure", references);
        }
    }

    [Fact]
    public void MessagingDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Conversation).Assembly);
        AssertNoForbiddenReferences(typeof(SendMessageHandler).Assembly);
        var references = typeof(SendMessageHandler).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.SocialGraph.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.SocialGraph.Infrastructure", references);
    }

    [Fact]
    public void NotificationsDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Notification).Assembly);
        AssertNoForbiddenReferences(typeof(NotificationsModule).Assembly);
    }

    [Fact]
    public void CommunitiesDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Community).Assembly);
        AssertNoForbiddenReferences(typeof(CreateCommunityHandler).Assembly);
    }

    [Fact]
    public void MediaDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(MediaAsset).Assembly);
        AssertNoForbiddenReferences(typeof(UploadMediaHandler).Assembly);
        var references = typeof(UploadMediaHandler).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.SocialGraph.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.SocialGraph.Infrastructure", references);
    }

    [Fact]
    public void StoriesDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(Story).Assembly);
        AssertNoForbiddenReferences(typeof(CreateStoryHandler).Assembly);
        var references = typeof(CreateStoryHandler).Assembly.GetReferencedAssemblies().Select(x => x.Name).ToArray();
        Assert.Contains("ZosyalMedya.Modules.Media.Contracts", references);
        Assert.Contains("ZosyalMedya.Modules.Profiles.Contracts", references);
        Assert.Contains("ZosyalMedya.Modules.SocialGraph.Contracts", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Media.Infrastructure", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.Profiles.Infrastructure", references);
        Assert.DoesNotContain("ZosyalMedya.Modules.SocialGraph.Infrastructure", references);
    }

    [Fact]
    public void SearchDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(SearchDocument).Assembly);
        AssertNoForbiddenReferences(typeof(SearchModule).Assembly);
    }

    [Fact]
    public void AuditDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(AuditEntry).Assembly);
        AssertNoForbiddenReferences(typeof(AuditModule).Assembly);
    }

    [Fact]
    public void ModerationDomainAndApplicationHaveNoFrameworkOrDriverReferences()
    {
        AssertNoForbiddenReferences(typeof(ModerationCase).Assembly);
        AssertNoForbiddenReferences(typeof(CreateReportHandler).Assembly);
    }

    [Fact] public void AdministrationDomainAndApplicationHaveNoFrameworkOrDriverReferences(){AssertNoForbiddenReferences(typeof(FeatureFlag).Assembly);AssertNoForbiddenReferences(typeof(AdministrationHandler).Assembly);}

    private static void AssertNoForbiddenReferences(Assembly assembly)
    {
        var references = assembly.GetReferencedAssemblies().Select(x => x.Name).Where(x => x is not null).ToArray();
        foreach (var forbidden in ForbiddenDrivers)
            Assert.DoesNotContain(references, reference => reference!.StartsWith(forbidden, StringComparison.Ordinal));
    }
}
