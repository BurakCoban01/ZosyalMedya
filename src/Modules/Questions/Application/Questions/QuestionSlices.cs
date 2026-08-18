using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Questions.Application.Questions;

public sealed record AskQuestionCommand(QuestionUserId SenderId, QuestionUserId TargetId, string Body, bool IsAnonymous,
    QuestionAudience Audience, bool IsDraft, DateTimeOffset? PublishAtUtc);
public sealed record QuestionSenderSummary(Guid OwnerId, string Handle, string DisplayName, Guid? ProfileMediaId,
    bool IsVerified);
public sealed record QuestionView(Guid Id, Guid TargetId, Guid? SenderId, string Body, bool IsAnonymous,
    QuestionSenderSummary? Sender, QuestionAudience Audience, QuestionStatus Status, string? Answer, DateTimeOffset? PublishAtUtc,
    DateTimeOffset? AnsweredAtUtc, DateTimeOffset CreatedAtUtc, long Version);

public sealed class AskQuestionHandler(IQuestionRepository questions, IProfilesModule profiles, IClock clock, ISearchModule search)
{
    public async Task<Result<QuestionView>> HandleAsync(AskQuestionCommand command, CancellationToken cancellationToken)
    {
        if (await profiles.FindByOwnerIdAsync(command.TargetId.Value, cancellationToken) is null)
            return Result.Failure<QuestionView>("questions.target_not_found", "Hedef profil bulunamadı.");
        try
        {
            var question = Question.Create(QuestionId.New(), command.SenderId, command.TargetId, command.Body,
                command.IsAnonymous, command.Audience, command.IsDraft, command.PublishAtUtc, clock.UtcNow);
            await questions.CreateAsync(question, cancellationToken);
            await QuestionSearchIndex.SyncAsync(search, question, cancellationToken);
            var sender = question.IsAnonymous ? null : await profiles.FindByOwnerIdAsync(question.SenderId.Value, cancellationToken);
            return Result.Success(Map(question, sender));
        }
        catch (DomainRuleException exception) { return Result.Failure<QuestionView>(exception.Code, exception.Message); }
    }

    internal static QuestionView Map(Question question, ProfileLookup? sender = null) => new(question.Id.Value, question.TargetId.Value,
        question.IsAnonymous ? null : question.SenderId.Value, question.Body, question.IsAnonymous,
        question.IsAnonymous || sender is null ? null : new(sender.OwnerId, sender.Handle, sender.DisplayName, sender.ProfileMediaId, sender.IsVerified), question.Audience,
        question.Status, string.IsNullOrEmpty(question.AnswerBody) ? null : question.AnswerBody, question.PublishAtUtc,
        question.AnsweredAtUtc, question.CreatedAtUtc, question.Version);
}

public sealed class AnswerQuestionHandler(IQuestionRepository questions, IProfilesModule profiles, IClock clock, ISearchModule search)
{
    public async Task<Result<QuestionView>> HandleAsync(QuestionId id, QuestionUserId actorId, string answer,
        CancellationToken cancellationToken)
    {
        var question = await questions.SelectAsync(x => x.Id == id, cancellationToken);
        if (question is null) return Result.Failure<QuestionView>("questions.not_found", "Soru bulunamadı.");
        var expectedVersion = question.Version;
        try { question.Answer(actorId, answer, clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<QuestionView>(exception.Code, exception.Message); }
        if (!await questions.UpdateAsync(x => x.Id == id, question, expectedVersion, cancellationToken))
            return Result.Failure<QuestionView>("questions.concurrency_conflict", "Soru eşzamanlı değiştirildi.");
        await QuestionSearchIndex.SyncAsync(search, question, cancellationToken);
        var sender = question.IsAnonymous ? null : await profiles.FindByOwnerIdAsync(question.SenderId.Value, cancellationToken);
        return Result.Success(AskQuestionHandler.Map(question, sender));
    }
}

public sealed class QuestionInboxHandler(IQuestionRepository questions, IProfilesModule profiles, IClock clock, ISearchModule search)
{
    public async Task<IReadOnlyList<QuestionView>> HandleAsync(QuestionUserId targetId, QuestionStatus? status, int limit,
        CancellationToken cancellationToken)
    {
        var items = await questions.ListByFilterAsync(x => x.TargetId == targetId && x.Status != QuestionStatus.Deleted &&
            (!status.HasValue || x.Status == status), new QueryOptions<Question>(limit,
            [new(x => x.CreatedAtUtc, SortDirection.Descending)]), cancellationToken);
        foreach (var item in items)
        {
            var expectedVersion = item.Version;
            item.PublishDue(clock.UtcNow);
            if (item.Version != expectedVersion &&
                await questions.UpdateAsync(x => x.Id == item.Id, item, expectedVersion, cancellationToken))
                await QuestionSearchIndex.SyncAsync(search, item, cancellationToken);
        }
        var visible = items.Where(x => x.Status != QuestionStatus.Scheduled).ToList();
        var senderIds = visible.Where(x => !x.IsAnonymous).Select(x => x.SenderId.Value).ToHashSet();
        var senders = senderIds.Count == 0 ? new Dictionary<Guid, ProfileLookup>()
            : await profiles.FindByOwnerIdsAsync(senderIds, cancellationToken);
        return visible.Select(x => AskQuestionHandler.Map(x, senders.GetValueOrDefault(x.SenderId.Value))).ToList();
    }
}

public sealed class GetQuestionHandler(IQuestionRepository questions, IProfilesModule profiles, ISocialGraphModule graph)
{
    public async Task<Result<QuestionView>> HandleAsync(QuestionId id, QuestionUserId? viewerId,
        CancellationToken cancellationToken)
    {
        var question = await questions.SelectAsync(x => x.Id == id, cancellationToken);
        if (question is null || question.Status != QuestionStatus.Answered)
            return Result.Failure<QuestionView>("questions.not_found", "Yanıtlanmış soru bulunamadı.");
        if (viewerId != question.TargetId)
        {
            RelationshipLookup? relationship = null;
            if (viewerId.HasValue)
                relationship = await graph.GetAsync(viewerId.Value.Value, question.TargetId.Value, cancellationToken);
            var visible = question.Audience == QuestionAudience.Public && relationship?.IsBlocked != true && relationship?.IsBlockedByTarget != true
                || question.Audience == QuestionAudience.Followers && relationship is { IsFollowing: true, IsBlocked: false, IsBlockedByTarget: false };
            if (!visible) return Result.Failure<QuestionView>("questions.not_visible", "Bu soru sana açık değil.");
        }
        var sender = question.IsAnonymous ? null : await profiles.FindByOwnerIdAsync(question.SenderId.Value, cancellationToken);
        return Result.Success(AskQuestionHandler.Map(question, sender));
    }
}

public sealed class ListProfileQuestionsHandler(IQuestionRepository questions, IProfilesModule profiles,
    ISocialGraphModule graph)
{
    public async Task<Result<IReadOnlyList<QuestionView>>> HandleAsync(QuestionUserId targetId,
        QuestionUserId? viewerId, int limit, CancellationToken cancellationToken)
    {
        if (await profiles.FindByOwnerIdAsync(targetId.Value, cancellationToken) is null)
            return Result.Failure<IReadOnlyList<QuestionView>>("questions.target_not_found", "Hedef profil bulunamadı.");
        var isOwner = viewerId == targetId;
        var isFollower = false;
        if (viewerId.HasValue && !isOwner)
        {
            var relationship = await graph.GetAsync(viewerId.Value.Value, targetId.Value, cancellationToken);
            if (relationship.IsBlocked || relationship.IsBlockedByTarget)
                return Result.Failure<IReadOnlyList<QuestionView>>("questions.not_visible", "Bu profil soruları sana açık değil.");
            isFollower = relationship.IsFollowing;
        }
        var take = Math.Clamp(limit, 1, 12);
        var items = await questions.ListByFilterAsync(x => x.TargetId == targetId && x.Status == QuestionStatus.Answered &&
            (isOwner || x.Audience == QuestionAudience.Public || isFollower && x.Audience == QuestionAudience.Followers),
            new QueryOptions<Question>(take, [new(x => x.UpdatedAtUtc, SortDirection.Descending)]), cancellationToken);
        var senderIds = items.Where(x => !x.IsAnonymous).Select(x => x.SenderId.Value).ToHashSet();
        var senders = senderIds.Count == 0 ? new Dictionary<Guid, ProfileLookup>()
            : await profiles.FindByOwnerIdsAsync(senderIds, cancellationToken);
        IReadOnlyList<QuestionView> result = items
            .Select(x => AskQuestionHandler.Map(x, senders.GetValueOrDefault(x.SenderId.Value))).ToList();
        return Result.Success(result);
    }
}

public sealed class PublishScheduledQuestionsHandler(IQuestionRepository questions, IClock clock, ISearchModule search)
{
    public async Task<int> HandleAsync(int limit, CancellationToken cancellationToken)
    {
        var due = await questions.ListDueScheduledAsync(clock.UtcNow, limit, cancellationToken);
        var published = 0;
        foreach (var question in due)
        {
            var version = question.Version;
            question.PublishDue(clock.UtcNow);
            if (question.Version == version ||
                !await questions.UpdateAsync(x => x.Id == question.Id, question, version, cancellationToken)) continue;
            await QuestionSearchIndex.SyncAsync(search, question, cancellationToken);
            published++;
        }
        return published;
    }
}

public sealed class ChangeQuestionStateHandler(IQuestionRepository questions, IProfilesModule profiles, IClock clock, ISearchModule search)
{
    public async Task<Result<QuestionView>> HandleAsync(QuestionId id, QuestionUserId actorId, bool delete,
        CancellationToken cancellationToken)
    {
        var question = await questions.SelectAsync(x => x.Id == id, cancellationToken);
        if (question is null) return Result.Failure<QuestionView>("questions.not_found", "Soru bulunamadı.");
        var expectedVersion = question.Version;
        try { if (delete) question.Delete(actorId, clock.UtcNow); else question.Archive(actorId, clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<QuestionView>(exception.Code, exception.Message); }
        if (!await questions.UpdateAsync(x => x.Id == id, question, expectedVersion, cancellationToken))
            return Result.Failure<QuestionView>("questions.concurrency_conflict", "Soru eşzamanlı değiştirildi.");
        await QuestionSearchIndex.SyncAsync(search, question, cancellationToken);
        var sender = question.IsAnonymous ? null : await profiles.FindByOwnerIdAsync(question.SenderId.Value, cancellationToken);
        return Result.Success(AskQuestionHandler.Map(question, sender));
    }
}

internal static class QuestionSearchIndex
{
    public static Task SyncAsync(ISearchModule search, Question question, CancellationToken token)
    {
        if (question.Status != QuestionStatus.Answered)
            return search.RemoveAsync(SearchDocumentType.Question, question.Id.Value, question.Version, token);
        var visibility = question.Audience == QuestionAudience.Public ? SearchVisibility.Public
            : question.Audience == QuestionAudience.Followers ? SearchVisibility.Followers : SearchVisibility.Private;
        return search.IndexAsync(new SearchDocumentContract(question.Id.Value, SearchDocumentType.Question,
            question.TargetId.Value, "Yanıtlanmış soru", $"{question.Body} {question.AnswerBody}", [], visibility,
            false, $"/sorular/{question.Id.Value:D}", question.AnsweredAtUtc ?? question.CreatedAtUtc,
            question.Version), token);
    }
}
