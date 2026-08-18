using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ZosyalMedya.BuildingBlocks.Application.Ports;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Notifications.Application.Ports;

namespace ZosyalMedya.Host.Api;

[Authorize]
public sealed class MessagingHub(IMessagingModule messaging, IPresenceStore presence,
    MessagingRealtimeBudget realtimeBudget) : Hub
{
    public override async Task OnConnectedAsync()
    {
        if (TryUserId(out var userId))
        {
            await presence.SetOnlineAsync(userId, Context.ConnectionId, TimeSpan.FromMinutes(2), Context.ConnectionAborted);
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId), Context.ConnectionAborted);
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (TryUserId(out var userId)) await presence.SetOfflineAsync(userId, Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinConversation(Guid conversationId)
    {
        if (!TryUserId(out var userId)) throw new HubException("Kimlik doğrulanamadı.");
        if (!realtimeBudget.TryAcquire(userId)) throw new HubException("Çok fazla gerçek zamanlı işlem yapıldı.");
        if (!await messaging.IsConversationMemberAsync(conversationId, userId, Context.ConnectionAborted))
            throw new HubException("Konuşma üyeliği gereklidir.");
        await Groups.AddToGroupAsync(Context.ConnectionId, ConversationGroup(conversationId), Context.ConnectionAborted);
    }

    public async Task Typing(Guid conversationId, bool isTyping)
    {
        if (!TryUserId(out var userId)) throw new HubException("Kimlik doğrulanamadı.");
        if (!realtimeBudget.TryAcquire(userId)) throw new HubException("Çok fazla gerçek zamanlı işlem yapıldı.");
        if (!await messaging.IsConversationMemberAsync(conversationId, userId, Context.ConnectionAborted))
            throw new HubException("Konuşma üyeliği gereklidir.");
        await Clients.OthersInGroup(ConversationGroup(conversationId)).SendAsync("typingChanged", new { conversationId, userId, isTyping }, Context.ConnectionAborted);
    }

    internal static string UserGroup(Guid userId) => $"user:{userId:N}";
    internal static string ConversationGroup(Guid conversationId) => $"conversation:{conversationId:N}";
    private bool TryUserId(out Guid userId) => Guid.TryParse(Context.User?.FindFirstValue("sub"), out userId);
}

public sealed class MessagingRealtimeBudget(int permitLimit) : IDisposable
{
    private readonly PartitionedRateLimiter<Guid> limiter = PartitionedRateLimiter.Create<Guid, Guid>(userId =>
        RateLimitPartition.GetFixedWindowLimiter(userId, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));

    public bool TryAcquire(Guid userId)
    {
        using var lease = limiter.AttemptAcquire(userId);
        return lease.IsAcquired;
    }

    public void Dispose() => limiter.Dispose();
}

public sealed class SignalRMessagePublisher(IHubContext<MessagingHub> hub) : IRealtimeMessagePublisher
{
    public Task MessageSentAsync(MessageNotification notification, CancellationToken cancellationToken = default) =>
        hub.Clients.Groups(notification.RecipientIds.Select(MessagingHub.UserGroup).ToArray()).SendAsync("messageReceived", notification, cancellationToken);

    public Task ReceiptChangedAsync(Guid conversationId, Guid messageId, Guid userId, string state, DateTimeOffset atUtc, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(MessagingHub.ConversationGroup(conversationId)).SendAsync("receiptChanged", new { conversationId, messageId, userId, state, atUtc }, cancellationToken);
    public Task MessageChangedAsync(Guid conversationId, Guid messageId, Guid senderId, string text,
        IReadOnlyList<Guid> mediaIds, Guid? replyToId, string status, string deliveryState,
        DateTimeOffset createdAtUtc, DateTimeOffset updatedAtUtc, long version, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(MessagingHub.ConversationGroup(conversationId)).SendAsync("messageChanged", new
        { id = messageId, conversationId, senderId, text, mediaIds, replyToId, status, deliveryState, createdAtUtc, updatedAtUtc, version }, cancellationToken);
}

public sealed class SignalRNotificationPublisher(IHubContext<MessagingHub> hub) : IRealtimeNotificationPublisher
{
    public Task PublishAsync(Guid recipientId, object payload, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(MessagingHub.UserGroup(recipientId)).SendAsync("notificationReceived", payload, cancellationToken);
}
