using System.ComponentModel.DataAnnotations;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Application.Questions;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Application.Stories;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Host.Api;

public sealed class PublicDemoRetentionOptions
{
    public const string SectionName = "PublicDemo:Retention";
    [Range(1, 168)] public int ArtifactHours { get; init; } = 24;
    [Range(1, 1440)] public int IntervalMinutes { get; init; } = 15;
    [Range(1, 100)] public int BatchSize { get; init; } = 50;
    [Range(1, 25)] public int AccountBatchSize { get; init; } = 5;
}

public sealed class PublicDemoRetentionWorker(
    IServiceProvider services,
    PublicDemoRetentionOptions options,
    TimeProvider timeProvider,
    ILogger<PublicDemoRetentionWorker> logger) : BackgroundService
{
    private static readonly Action<ILogger, Exception?> LogCycleFailure =
        LoggerMessage.Define(LogLevel.Error, new EventId(1, "PublicDemoRetentionCycleFailed"),
            "Public demo retention cycle failed; the next bounded cycle will retry.");
    private UserId? afterUserId;
    private MediaId? afterMediaId;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RunOnceAsync(stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(options.IntervalMinutes), timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await RunOnceAsync(stoppingToken);
    }

    private async Task RunOnceAsync(CancellationToken token)
    {
        try
        {
            await using var scope = services.CreateAsyncScope();
            var policy = scope.ServiceProvider.GetRequiredService<IPublicDemoIdentityPolicy>();
            if (!policy.Enabled) return;
            var users = scope.ServiceProvider.GetRequiredService<IUserAccountRepository>();
            for (var step = 0; step < options.AccountBatchSize; step++)
            {
                var page = await users.ListVisitorPageAsync(policy.VisitorEmailDomain, afterUserId, 1, token);
                if (page.Count == 0)
                {
                    afterUserId = null;
                    afterMediaId = null;
                    break;
                }

                var cycle = ActivatorUtilities.CreateInstance<PublicDemoRetentionCycle>(scope.ServiceProvider);
                var result = await cycle.RedactAsync(page[0].Id,
                    timeProvider.GetUtcNow().Subtract(TimeSpan.FromHours(options.ArtifactHours)), options.BatchSize,
                    afterMediaId, token);
                afterMediaId = result.NextMediaId;
                if (!result.Drained) break;
                afterUserId = page[0].Id;
                afterMediaId = null;
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception exception)
        {
            LogCycleFailure(logger, exception);
        }
    }
}

public sealed class PublicDemoRetentionCycle(
    IPostRepository posts,
    ChangePostHandler changePost,
    IMessageRepository messages,
    IRealtimeMessagePublisher realtime,
    IQuestionRepository questions,
    ChangeQuestionStateHandler changeQuestion,
    IStoryRepository stories,
    DeleteStoryHandler deleteStory,
    IMediaRepository media,
    DeleteMediaHandler deleteMedia,
    TimeProvider timeProvider)
{
    public async Task<PublicDemoRetentionResult> RedactAsync(UserId userId, DateTimeOffset cutoff, int requestedBatch,
        MediaId? afterMediaId, CancellationToken token)
    {
        var batch = Math.Clamp(requestedBatch, 1, QueryOptions<Post>.MaximumLimit);
        var owner = userId.Value;
        var allSucceeded = true;

        var oldPosts = await posts.ListByFilterAsync(
            x => x.AuthorId == new ContentAuthorId(owner) && x.CreatedAtUtc <= cutoff && x.Status != PostStatus.Deleted,
            Oldest<Post>(batch, x => x.CreatedAtUtc), token);
        foreach (var post in oldPosts)
            allSucceeded &= (await changePost.HandleAsync(post.Id, post.AuthorId, PostChange.Delete, token)).IsSuccess;

        var oldMessages = await messages.ListByFilterAsync(
            x => x.SenderId == new MessageSenderId(owner) && x.CreatedAtUtc <= cutoff && x.Status != MessageStatus.Deleted,
            Oldest<Message>(batch, x => x.CreatedAtUtc), token);
        foreach (var message in oldMessages)
        {
            var version = message.Version;
            message.RedactForRetention(timeProvider.GetUtcNow());
            if (!await messages.UpdateAsync(x => x.Id == message.Id, message, version, token))
            {
                allSucceeded = false;
                continue;
            }
            await realtime.MessageChangedAsync(message.ConversationId.Value, message.Id.Value, message.SenderId.Value,
                message.Text, message.MediaIds, message.ReplyToId?.Value, message.Status.ToString(), DeliveryState(message),
                message.CreatedAtUtc, message.UpdatedAtUtc, message.Version, token);
        }

        var oldQuestions = await questions.ListByFilterAsync(
            x => (x.SenderId == new QuestionUserId(owner) || x.TargetId == new QuestionUserId(owner)) &&
                 x.CreatedAtUtc <= cutoff && x.Status != QuestionStatus.Deleted,
            Oldest<Question>(batch, x => x.CreatedAtUtc), token);
        foreach (var question in oldQuestions)
            allSucceeded &= (await changeQuestion.HandleAsync(question.Id, new QuestionUserId(owner), true, token)).IsSuccess;

        var oldStories = await stories.ListByFilterAsync(
            x => x.OwnerId == new StoryOwnerId(owner) && x.CreatedAtUtc <= cutoff && x.Status != StoryStatus.Deleted,
            Oldest<Story>(batch, x => x.CreatedAtUtc), token);
        foreach (var story in oldStories)
            allSucceeded &= (await deleteStory.HandleAsync(story.Id.Value, owner, token)).IsSuccess;

        var artifactsDrained = allSucceeded && oldPosts.Count < batch && oldMessages.Count < batch &&
                               oldQuestions.Count < batch && oldStories.Count < batch;
        if (!artifactsDrained) return new(false, afterMediaId);

        var oldMedia = await media.ListByFilterAsync(
            x => x.OwnerId == new MediaOwnerId(owner) && x.CreatedAtUtc <= cutoff &&
                 (x.Status == MediaStatus.Ready || x.Status == MediaStatus.Quarantined ||
                  x.Status == MediaStatus.Deleted) &&
                 (!afterMediaId.HasValue || x.Id.Value.CompareTo(afterMediaId.Value.Value) > 0),
            Oldest<MediaAsset>(batch, x => x.Id), token);
        foreach (var item in oldMedia)
        {
            // Public-demo visitor media has an explicit age limit. Expiry is independent of references;
            // attachments created before the cutoff therefore expire together with their underlying object.
            // Pending/Processing records remain owned by the existing expiry cleanup service.
            var deleted = await deleteMedia.HandleAsync(item.Id.Value, owner, token);
            if (!deleted.IsSuccess) return new(false, afterMediaId);
            await media.DeleteByFilterAsync(x => x.Id == item.Id && x.Status == MediaStatus.Deleted, token);
            afterMediaId = item.Id;
        }

        return oldMedia.Count < batch ? new(true, null) : new(false, afterMediaId);
    }

    private static QueryOptions<T> Oldest<T>(int batch,
        System.Linq.Expressions.Expression<Func<T, object>> key) where T : class =>
        new(batch, [new SortExpression<T>(key, SortDirection.Ascending)]);

    private static string DeliveryState(Message message) => message.Receipts.Count == 0 ? "Sent"
        : message.Receipts.All(receipt => receipt.ReadAtUtc.HasValue) ? "Read"
        : message.Receipts.All(receipt => receipt.DeliveredAtUtc.HasValue) ? "Delivered" : "Sent";
}

public sealed record PublicDemoRetentionResult(bool Drained, MediaId? NextMediaId);
