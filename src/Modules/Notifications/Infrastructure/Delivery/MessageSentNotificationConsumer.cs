using System.Text.Json;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Notifications.Contracts;

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Delivery;

public sealed class MessageSentNotificationConsumer(INotificationsModule notifications) : IIntegrationEventConsumer
{
    public string EventType => $"{typeof(MessageSentIntegrationEvent).FullName}:v1";
    public async Task HandleAsync(IntegrationEventEnvelope envelope, CancellationToken cancellationToken = default)
    {
        var message = JsonSerializer.Deserialize<MessageSentIntegrationEvent>(envelope.Payload) ??
            throw new InvalidOperationException("MessageSent olay gövdesi okunamadı.");
        foreach (var recipientId in message.RecipientIds)
            await notifications.EnqueueAsync(new EnqueueNotification(recipientId, message.SenderId, "Message", message.MessageId,
                $"message:{message.ConversationId:N}:{recipientId:N}", "notification.message.title", "notification.message.body", 1,
                new Dictionary<string, string> { ["senderId"] = message.SenderId.ToString("D"), ["preview"] = message.Preview },
                $"/mesajlar?conversation={message.ConversationId:D}", $"message:{message.MessageId:N}:{recipientId:N}"), cancellationToken);
    }
}
