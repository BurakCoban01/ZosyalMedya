using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.MongoDb;

/// <summary>
/// Mesaj belgesine atomik olarak gömülen entegrasyon olaylarını lease ile teslim eder.
/// Böylece standalone MongoDB geliştirme profilinde transaction gerektirmeden mesaj ve olay birlikte kalıcı olur.
/// </summary>
internal sealed class MongoMessageOutboxWorker(
    IServiceProvider provider,
    MessagingMongoDatabase database,
    IOptions<OutboxOptions> options,
    TimeProvider timeProvider,
    ILogger<MongoMessageOutboxWorker> logger) : BackgroundService
{
    private readonly IMongoCollection<BsonDocument> messages = database.Database.GetCollection<BsonDocument>("messages");
    private readonly string workerId = $"{Environment.MachineName}:{Environment.ProcessId}:{Guid.NewGuid():N}";
    private static readonly Action<ILogger, Exception?> LogCycleFailed =
        LoggerMessage.Define(LogLevel.Error, new EventId(4201, "MongoOutboxCycleFailed"), "Mongo embedded outbox cycle failed");
    private static readonly Action<ILogger, Guid, Exception?> LogDeliveryFailed =
        LoggerMessage.Define<Guid>(LogLevel.Warning, new EventId(4202, "MongoOutboxDeliveryFailed"),
            "Mongo embedded outbox event {EventId} delivery failed");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(options.Value.PollSeconds, 1, 60)));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                for (var index = 0; index < Math.Clamp(options.Value.BatchSize, 1, 200); index++)
                {
                    var claimed = await ClaimAsync(stoppingToken);
                    if (claimed is null) break;
                    await DeliverAsync(claimed.Value.MessageId, claimed.Value.Event, stoppingToken);
                }
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { LogCycleFailed(logger, exception); }
        }
    }

    private async Task<(BsonValue MessageId, BsonDocument Event)?> ClaimAsync(CancellationToken token)
    {
        var now = timeProvider.GetUtcNow();
        var eligible = new BsonDocument
        {
            ["ProcessedAtUtc"] = BsonNull.Value,
            ["DeadLetteredAtUtc"] = BsonNull.Value,
            ["NextAttemptAtUtc"] = new BsonDocument("$lte", now.UtcDateTime),
            ["$or"] = new BsonArray
            {
                new BsonDocument("LockedUntilUtc", BsonNull.Value),
                new BsonDocument("LockedUntilUtc", new BsonDocument("$lte", now.UtcDateTime))
            }
        };
        var filter = new BsonDocument("_pendingEvents", new BsonDocument("$elemMatch", eligible));
        var leaseUntil = now.AddSeconds(Math.Clamp(options.Value.LeaseSeconds, 5, 600));
        var update = new BsonDocument("$set", new BsonDocument
        {
            ["_pendingEvents.$.LockedBy"] = workerId,
            ["_pendingEvents.$.LockedUntilUtc"] = leaseUntil.UtcDateTime
        });
        var document = await messages.FindOneAndUpdateAsync(filter, update,
            new FindOneAndUpdateOptions<BsonDocument> { ReturnDocument = ReturnDocument.After }, token);
        if (document is null) return null;
        var @event = document["_pendingEvents"].AsBsonArray.Select(x => x.AsBsonDocument)
            .Single(x => x["LockedBy"].IsString && x["LockedBy"].AsString == workerId);
        return (document["_id"], @event);
    }

    private async Task DeliverAsync(BsonValue messageId, BsonDocument @event, CancellationToken token)
    {
        var eventId = @event["Id"].AsGuid;
        var envelope = new IntegrationEventEnvelope(eventId, @event["Type"].AsString,
            @event["Payload"].AsString, @event["CorrelationId"].AsString,
            new DateTimeOffset(@event["OccurredAtUtc"].ToUniversalTime(), TimeSpan.Zero));
        try
        {
            await using var scope = provider.CreateAsyncScope();
            var inbox = scope.ServiceProvider.GetRequiredService<OutboxDbContext>();
            foreach (var consumer in scope.ServiceProvider.GetServices<IIntegrationEventConsumer>()
                         .Where(x => x.EventType == envelope.Type))
            {
                var handler = consumer.GetType().FullName ?? consumer.GetType().Name;
                if (await inbox.Inbox.AnyAsync(x => x.MessageId == eventId && x.Handler == handler, token)) continue;
                await consumer.HandleAsync(envelope, token);
                inbox.Inbox.Add(new InboxReceipt(eventId, handler, timeProvider.GetUtcNow()));
                await inbox.SaveChangesAsync(token);
            }
            await UpdateEventAsync(messageId, eventId, new BsonDocument
            {
                ["ProcessedAtUtc"] = timeProvider.GetUtcNow().UtcDateTime,
                ["LockedBy"] = BsonNull.Value,
                ["LockedUntilUtc"] = BsonNull.Value,
                ["LastError"] = string.Empty
            }, token);
        }
        catch (Exception exception)
        {
            var attempts = @event["Attempts"].AsInt32 + 1;
            var now = timeProvider.GetUtcNow();
            var changes = new BsonDocument
            {
                ["Attempts"] = attempts,
                ["LastError"] = exception.Message[..Math.Min(exception.Message.Length, 2000)],
                ["LockedBy"] = BsonNull.Value,
                ["LockedUntilUtc"] = BsonNull.Value
            };
            if (attempts >= Math.Clamp(options.Value.MaxAttempts, 1, 100)) changes["DeadLetteredAtUtc"] = now.UtcDateTime;
            else changes["NextAttemptAtUtc"] = now.AddSeconds(Math.Min(300, Math.Pow(2, attempts))).UtcDateTime;
            await UpdateEventAsync(messageId, eventId, changes, token);
            LogDeliveryFailed(logger, eventId, exception);
        }
    }

    private Task<UpdateResult> UpdateEventAsync(BsonValue messageId, Guid eventId, BsonDocument changes, CancellationToken token)
    {
        var filter = new BsonDocument { ["_id"] = messageId, ["_pendingEvents.Id"] = new BsonBinaryData(eventId, GuidRepresentation.Standard) };
        var set = new BsonDocument(changes.Select(item => new BsonElement($"_pendingEvents.$.{item.Name}", item.Value)));
        return messages.UpdateOneAsync(filter, new BsonDocument("$set", set), cancellationToken: token);
    }
}
