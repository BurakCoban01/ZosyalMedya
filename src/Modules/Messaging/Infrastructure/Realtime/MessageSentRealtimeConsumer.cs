using System.Text.Json;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Contracts;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Realtime;

public sealed class MessageSentRealtimeConsumer(IRealtimeMessagePublisher publisher) : IIntegrationEventConsumer
{
    public string EventType => $"{typeof(MessageSentIntegrationEvent).FullName}:v1";
    public async Task HandleAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        var message = JsonSerializer.Deserialize<MessageSentIntegrationEvent>(envelope.Payload) ??
            throw new InvalidOperationException("MessageSent olay gövdesi okunamadı.");
        await publisher.MessageSentAsync(new MessageNotification(message.MessageId, message.ConversationId, message.SenderId,
            message.RecipientIds, message.Preview, message.OccurredAtUtc), cancellationToken);
    }
}
