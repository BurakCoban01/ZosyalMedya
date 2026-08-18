using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.MongoDb;

internal sealed class MongoRelationshipOutboxWorker(
    IServiceProvider provider,
    SocialGraphMongoDatabase database,
    IOptions<OutboxOptions> options,
    TimeProvider timeProvider,
    ILogger<MongoRelationshipOutboxWorker> logger) : BackgroundService
{
    private readonly IMongoCollection<BsonDocument> relationships = database.Database.GetCollection<BsonDocument>("relationships");
    private readonly string workerId = $"{Environment.MachineName}:{Environment.ProcessId}:{Guid.NewGuid():N}";
    private static readonly Action<ILogger, Exception?> LogCycleFailed =
        LoggerMessage.Define(LogLevel.Error, new EventId(4211, "MongoSocialGraphOutboxCycleFailed"), "Mongo social graph outbox cycle failed");
    private static readonly Action<ILogger, Guid, Exception?> LogDeliveryFailed =
        LoggerMessage.Define<Guid>(LogLevel.Warning, new EventId(4212, "MongoSocialGraphOutboxDeliveryFailed"),
            "Mongo social graph outbox event {EventId} delivery failed");

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
                    await DeliverAsync(claimed.Value.RelationshipId, claimed.Value.Event, stoppingToken);
                }
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { LogCycleFailed(logger, exception); }
        }
    }

    private async Task<(BsonValue RelationshipId, BsonDocument Event)?> ClaimAsync(CancellationToken token)
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
        var claimId = $"{workerId}:{Guid.NewGuid():N}";
        var update = new BsonDocument("$set", new BsonDocument
        {
            ["_pendingEvents.$.LockedBy"] = claimId,
            ["_pendingEvents.$.LockedUntilUtc"] = leaseUntil.UtcDateTime
        });
        var document = await relationships.FindOneAndUpdateAsync(filter, update,
            new FindOneAndUpdateOptions<BsonDocument> { ReturnDocument = ReturnDocument.After }, token);
        if (document is null) return null;
        var @event = document["_pendingEvents"].AsBsonArray.Select(x => x.AsBsonDocument)
            .Single(x => x["LockedBy"].IsString && x["LockedBy"].AsString == claimId);
        return (document["_id"], @event);
    }

    private async Task DeliverAsync(BsonValue relationshipId, BsonDocument @event, CancellationToken token)
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
            await UpdateEventAsync(relationshipId, eventId, new BsonDocument
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
            await UpdateEventAsync(relationshipId, eventId, changes, token);
            LogDeliveryFailed(logger, eventId, exception);
        }
    }

    private Task<UpdateResult> UpdateEventAsync(BsonValue relationshipId, Guid eventId, BsonDocument changes, CancellationToken token)
    {
        var filter = new BsonDocument { ["_id"] = relationshipId, ["_pendingEvents.Id"] = new BsonBinaryData(eventId, GuidRepresentation.Standard) };
        var set = new BsonDocument(changes.Select(item => new BsonElement($"_pendingEvents.$.{item.Name}", item.Value)));
        return relationships.UpdateOneAsync(filter, new BsonDocument("$set", set), cancellationToken: token);
    }
}
