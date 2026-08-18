using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Application.Questions;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Questions;

public sealed class QuestionProfileVisibilityTests
{
    private static readonly Guid Target = Guid.NewGuid();
    private static readonly Guid Follower = Guid.NewGuid();
    private static readonly Guid Blocked = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 8, 14, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ProfileListEnforcesAudienceAndBlockWhileRedactingAnonymousSender()
    {
        var publicAnonymous = Answered(Guid.NewGuid(), QuestionAudience.Public, true);
        var followersOpen = Answered(Guid.NewGuid(), QuestionAudience.Followers, false);
        var profileOnly = Answered(Guid.NewGuid(), QuestionAudience.Profile, false);
        var handler = new ListProfileQuestionsHandler(new Repository([publicAnonymous, followersOpen, profileOnly]),
            new Profiles(), new Graph());

        var anonymous = await handler.HandleAsync(new(Target), null, 6, default);
        var follower = await handler.HandleAsync(new(Target), new(Follower), 6, default);
        var owner = await handler.HandleAsync(new(Target), new(Target), 6, default);
        var blocked = await handler.HandleAsync(new(Target), new(Blocked), 6, default);

        Assert.True(anonymous.IsSuccess);
        Assert.Single(anonymous.Value!);
        Assert.Null(anonymous.Value![0].SenderId);
        Assert.Null(anonymous.Value[0].Sender);
        Assert.Equal(2, follower.Value!.Count);
        Assert.NotNull(follower.Value.Single(x => x.Id == followersOpen.Id.Value).Sender);
        Assert.Equal(3, owner.Value!.Count);
        Assert.False(blocked.IsSuccess);
        Assert.Equal("questions.not_visible", blocked.Error.Code);
    }

    private static Question Answered(Guid sender, QuestionAudience audience, bool anonymous)
    {
        var question = Question.Create(QuestionId.New(), new(sender), new(Target), "Profilde yanıtlanacak soru",
            anonymous, audience, false, null, Now);
        question.Answer(new(Target), "Gerçek ve görünür yanıt", Now.AddMinutes(1));
        return question;
    }

    private sealed class Repository(IReadOnlyList<Question> values) : IQuestionRepository
    {
        public Task<IReadOnlyList<Question>> ListByFilterAsync(Expression<Func<Question, bool>> predicate,
            QueryOptions<Question>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Question>>(values.Where(predicate.Compile()).Take(options?.BoundedLimit ?? 50).ToArray());
        public Task<Question?> SelectAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<QuestionId> CreateAsync(Question entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<Question, bool>> predicate, Question replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> DeleteByFilterAsync(Expression<Func<Question, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<Question>> ListDueScheduledAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class Profiles : IProfilesModule
    {
        public Task<ProfileLookup?> FindByOwnerIdAsync(Guid ownerId, CancellationToken cancellationToken = default) =>
            Task.FromResult<ProfileLookup?>(new(ownerId, $"user_{ownerId:N}"[..16], "Görünür Kullanıcı", false, null, false));
        public Task<IReadOnlyDictionary<Guid, ProfileLookup>> FindByOwnerIdsAsync(IReadOnlySet<Guid> ownerIds,
            CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyDictionary<Guid, ProfileLookup>>(
            ownerIds.ToDictionary(id => id, id => new ProfileLookup(id, $"user_{id:N}"[..16], "Görünür Kullanıcı", false, null, false)));
    }

    private sealed class Graph : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, actorId == Follower, actorId == Blocked, false, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }
}
