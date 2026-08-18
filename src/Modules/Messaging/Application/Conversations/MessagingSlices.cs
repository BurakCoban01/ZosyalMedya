using System.Globalization;
using System.Text;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Notifications.Contracts;
using ZosyalMedya.Modules.Media.Contracts;

namespace ZosyalMedya.Modules.Messaging.Application.Conversations;

public sealed record ConversationMemberView(Guid UserId, string Role, DateTimeOffset JoinedAtUtc, bool IsMuted,
    bool IsArchived, bool IsPinned, string? DisplayName, string? Handle);
public sealed record ConversationView(Guid Id, string Kind, string Title, IReadOnlyList<ConversationMemberView> Members, DateTimeOffset UpdatedAtUtc, long UnreadCount, long Version);
public sealed record ConversationPage(IReadOnlyList<ConversationView> Items, string? NextCursor);
public sealed record MessageView(Guid Id, Guid ConversationId, Guid SenderId, string Text, IReadOnlyList<Guid> MediaIds,
    Guid? ReplyToId, string Status, string DeliveryState, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc, long Version);
public sealed record MessagePage(IReadOnlyList<MessageView> Items, string? NextCursor);

public sealed class CreateConversationHandler(IConversationRepository conversations, ISocialGraphModule graph, IProfilesModule profiles, IClock clock)
{
    public async Task<Result<ConversationView>> HandleAsync(Guid actorId, IReadOnlyList<Guid> memberIds, string? title, CancellationToken cancellationToken)
    {
        var members = memberIds.Where(x => x != Guid.Empty && x != actorId).Distinct().ToArray();
        if (members.Length == 0) return Result.Failure<ConversationView>("messaging.members_required", "En az bir başka üye gereklidir.");
        var memberProfiles = new Dictionary<Guid, ProfileLookup>();
        foreach (var memberId in members)
        {
            var profile = await profiles.FindByOwnerIdAsync(memberId, cancellationToken);
            if (profile is null)
                return Result.Failure<ConversationView>("messaging.member_not_found", "Konuşma üyelerinden biri bulunamadı.");
            memberProfiles[memberId] = profile;
        }
        var actorProfile = await profiles.FindByOwnerIdAsync(actorId, cancellationToken);
        if (actorProfile is not null) memberProfiles[actorId] = actorProfile;
        try
        {
            Conversation conversation;
            if (members.Length == 1 && string.IsNullOrWhiteSpace(title))
            {
                var targetId = members[0];
                var relation = await graph.GetAsync(actorId, targetId, cancellationToken);
                if (relation.IsBlocked || relation.IsBlockedByTarget)
                    return Result.Failure<ConversationView>("messaging.blocked", "Engellenen hesapla konuşma başlatılamaz.");
                var existing = await conversations.FindDirectAsync(new(actorId), new(targetId), cancellationToken);
                if (existing is not null) return Result.Success(Map(existing, 0, memberProfiles));
                conversation = Conversation.CreateDirect(ConversationId.New(), new(actorId), new(targetId), clock.UtcNow);
            }
            else
            {
                conversation = Conversation.CreateGroup(ConversationId.New(), new(actorId), members.Select(x => new ConversationMemberId(x)), title ?? string.Empty, clock.UtcNow);
            }
            await conversations.CreateAsync(conversation, cancellationToken);
            return Result.Success(Map(conversation, 0, memberProfiles));
        }
        catch (DomainRuleException exception) { return Result.Failure<ConversationView>(exception.Code, exception.Message); }
    }

    internal static ConversationView Map(Conversation conversation, long unreadCount,
        IReadOnlyDictionary<Guid, ProfileLookup>? profiles = null) => new(
        conversation.Id.Value, conversation.Kind.ToString(), conversation.Title,
        conversation.Members.Where(x => x.IsActive).Select(x =>
        {
            var profile = profiles?.GetValueOrDefault(x.UserId.Value);
            return new ConversationMemberView(x.UserId.Value, x.Role.ToString(), x.JoinedAtUtc,
                x.MutedUntilUtc.HasValue, x.IsArchived, x.IsPinned, profile?.DisplayName, profile?.Handle);
        }).ToArray(),
        conversation.UpdatedAtUtc, unreadCount, conversation.Version);
}

public sealed class ListConversationsHandler(IConversationRepository conversations, IMessageRepository messages,
    IProfilesModule profiles)
{
    public async Task<ConversationPage> HandleAsync(Guid actorId, int limit, string? cursor, CancellationToken cancellationToken)
    {
        limit = Math.Clamp(limit, 1, 50); var (time, id) = Cursor.DecodeConversation(cursor);
        var items = await conversations.ListForMemberAsync(new(new(actorId), time, id, limit), cancellationToken);
        var ownerIds = items.SelectMany(item => item.ActiveMemberIds()).Select(member => member.Value).ToHashSet();
        var memberProfiles = ownerIds.Count == 0
            ? new Dictionary<Guid, ProfileLookup>()
            : await profiles.FindByOwnerIdsAsync(ownerIds, cancellationToken);
        var views = new List<ConversationView>(items.Count);
        foreach (var item in items)
        {
            var unread = await messages.CountUnreadAsync(item.Id, actorId, cancellationToken);
            views.Add(CreateConversationHandler.Map(item, unread, memberProfiles));
        }
        return new(views, items.Count == limit ? Cursor.Encode(items[^1].UpdatedAtUtc, items[^1].Id.Value) : null);
    }
}

public sealed class SendMessageHandler(IConversationRepository conversations, IMessageRepository messages,
    ISocialGraphModule graph, IClock clock, IMediaModule media)
{
    public async Task<Result<MessageView>> HandleAsync(Guid conversationId, Guid actorId, string text,
        IReadOnlyList<Guid>? mediaIds, Guid? replyToId, CancellationToken cancellationToken)
    {
        var conversation = await conversations.SelectAsync(x => x.Id == new ConversationId(conversationId), cancellationToken);
        if (conversation is null) return Result.Failure<MessageView>("messaging.conversation_not_found", "Konuşma bulunamadı.");
        if (!conversation.HasActiveMember(new(actorId))) return Result.Failure<MessageView>("messaging.not_member", "Konuşma üyeliği gereklidir.");
        if (conversation.Kind == ConversationKind.Direct)
        {
            var targetId = conversation.ActiveMemberIds().Single(x => x.Value != actorId).Value;
            var relation = await graph.GetAsync(actorId, targetId, cancellationToken);
            if (relation.IsBlocked || relation.IsBlockedByTarget)
                return Result.Failure<MessageView>("messaging.blocked", "Engellenen hesapla mesajlaşılamaz.");
        }
        if (replyToId.HasValue)
        {
            var replied = await messages.SelectAsync(x => x.Id == new MessageId(replyToId.Value), cancellationToken);
            if (replied is null || replied.ConversationId != conversation.Id)
                return Result.Failure<MessageView>("messaging.reply_invalid", "Yanıtlanan mesaj bu konuşmada değil.");
        }
        var validatedMediaIds = (mediaIds ?? []).Distinct().ToArray();
        if (validatedMediaIds.Length > 10)
            return Result.Failure<MessageView>("messaging.media_limit", "Bir mesaja en fazla 10 medya eklenebilir.");
        foreach (var mediaId in validatedMediaIds)
        {
            var asset = await media.GetAuthorizedAsync(mediaId, actorId, cancellationToken);
            if (asset is null || asset.OwnerId != actorId || asset.Status != "Ready")
                return Result.Failure<MessageView>("messaging.media_invalid", "Medya bulunamadı, hazır değil veya bu hesaba ait değil.");
            if (asset.Visibility != "Private")
                return Result.Failure<MessageView>("messaging.media_visibility_invalid", "Mesaj medyası yalnız konuşma katılımcılarına özel olmalı.");
        }
        try
        {
            var recipients = conversation.ActiveMemberIds().Select(x => x.Value).ToArray();
            var message = Message.Create(MessageId.New(), conversation.Id, new(actorId), text, validatedMediaIds,
                replyToId.HasValue ? new MessageId(replyToId.Value) : null, recipients, clock.UtcNow);
            await messages.CreateAsync(message, cancellationToken);
            return Result.Success(Map(message));
        }
        catch (DomainRuleException exception) { return Result.Failure<MessageView>(exception.Code, exception.Message); }
    }
    internal static MessageView Map(Message message) => new(message.Id.Value, message.ConversationId.Value,
        message.SenderId.Value, message.Text, message.MediaIds, message.ReplyToId?.Value, message.Status.ToString(), DeliveryState(message),
        message.CreatedAtUtc, message.UpdatedAtUtc, message.Version);
    private static string DeliveryState(Message message) => message.Receipts.Count == 0 ? "Sent"
        : message.Receipts.All(receipt => receipt.ReadAtUtc.HasValue) ? "Read"
        : message.Receipts.All(receipt => receipt.DeliveredAtUtc.HasValue) ? "Delivered" : "Sent";
}

public sealed class ListMessagesHandler(IConversationRepository conversations, IMessageRepository messages,
    IRealtimeMessagePublisher realtime, IClock clock)
{
    public async Task<Result<MessagePage>> HandleAsync(Guid conversationId, Guid actorId, int limit, string? cursor, CancellationToken cancellationToken)
    {
        var conversation = await conversations.SelectAsync(x => x.Id == new ConversationId(conversationId), cancellationToken);
        if (conversation is null) return Result.Failure<MessagePage>("messaging.conversation_not_found", "Konuşma bulunamadı.");
        if (!conversation.HasActiveMember(new(actorId))) return Result.Failure<MessagePage>("messaging.not_member", "Konuşma üyeliği gereklidir.");
        limit = Math.Clamp(limit, 1, 100); var (time, id) = Cursor.DecodeMessage(cursor);
        var items = await messages.ListPageAsync(new(conversation.Id, time, id, limit), cancellationToken);
        foreach (var item in items.Where(message => message.SenderId.Value != actorId &&
                     message.Receipts.Any(receipt => receipt.UserId == actorId && receipt.ReadAtUtc is null)))
        {
            var expectedVersion = item.Version;
            var readAtUtc = clock.UtcNow;
            item.MarkRead(actorId, readAtUtc);
            if (await messages.UpdateAsync(x => x.Id == item.Id, item, expectedVersion, cancellationToken))
                await realtime.ReceiptChangedAsync(conversation.Id.Value, item.Id.Value, actorId,
                    MessageChange.Read.ToString(), readAtUtc, cancellationToken);
        }
        return Result.Success(new MessagePage(items.Select(SendMessageHandler.Map).ToArray(),
            items.Count == limit ? Cursor.Encode(items[^1].CreatedAtUtc, items[^1].Id.Value) : null));
    }
}

public enum MessageChange { Edit, Delete, Delivered, Read }
public sealed class ChangeMessageHandler(IConversationRepository conversations, IMessageRepository messages,
    IRealtimeMessagePublisher realtime, IClock clock)
{
    public async Task<Result<MessageView>> HandleAsync(Guid messageId, Guid actorId, MessageChange change, string? text, CancellationToken cancellationToken)
    {
        var message = await messages.SelectAsync(x => x.Id == new MessageId(messageId), cancellationToken);
        if (message is null) return Result.Failure<MessageView>("messaging.message_not_found", "Mesaj bulunamadı.");
        var conversation = await conversations.SelectAsync(x => x.Id == message.ConversationId, cancellationToken);
        if (conversation is null || !conversation.HasActiveMember(new(actorId)))
            return Result.Failure<MessageView>("messaging.not_member", "Konuşma üyeliği gereklidir.");
        var expectedVersion = message.Version;
        try
        {
            switch (change)
            {
                case MessageChange.Edit: message.Edit(new(actorId), text ?? string.Empty, clock.UtcNow); break;
                case MessageChange.Delete: message.Delete(new(actorId), clock.UtcNow); break;
                case MessageChange.Delivered: message.MarkDelivered(actorId, clock.UtcNow); break;
                case MessageChange.Read: message.MarkRead(actorId, clock.UtcNow); break;
            }
        }
        catch (DomainRuleException exception) { return Result.Failure<MessageView>(exception.Code, exception.Message); }
        if (!await messages.UpdateAsync(x => x.Id == message.Id, message, expectedVersion, cancellationToken))
            return Result.Failure<MessageView>("messaging.concurrency_conflict", "Mesaj eşzamanlı değiştirildi.");
        if (change is MessageChange.Delivered or MessageChange.Read)
            await realtime.ReceiptChangedAsync(message.ConversationId.Value, message.Id.Value, actorId, change.ToString(), clock.UtcNow, cancellationToken);
        var view = SendMessageHandler.Map(message);
        if (change is MessageChange.Edit or MessageChange.Delete)
            await realtime.MessageChangedAsync(view.ConversationId, view.Id, view.SenderId, view.Text, view.MediaIds,
                view.ReplyToId, view.Status, view.DeliveryState, view.CreatedAtUtc, view.UpdatedAtUtc, view.Version,
                cancellationToken);
        return Result.Success(view);
    }
}

public sealed class MessagingModule(IConversationRepository conversations) : IMessagingModule
{
    public async Task<bool> IsConversationMemberAsync(Guid conversationId, Guid userId, CancellationToken cancellationToken = default)
    {
        var conversation = await conversations.SelectAsync(x => x.Id == new ConversationId(conversationId), cancellationToken);
        return conversation?.HasActiveMember(new(userId)) == true;
    }
}

public sealed class MessagingMediaAccessGrantProvider(IMessageRepository messages) : IMediaAccessGrantProvider
{
    public Task<bool> CanViewAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default) =>
        viewerId.HasValue ? messages.CanMemberAccessMediaAsync(mediaId, viewerId.Value, cancellationToken) : Task.FromResult(false);
}

internal static class Cursor
{
    public static string Encode(DateTimeOffset time, Guid id) => Convert.ToBase64String(Encoding.UTF8.GetBytes($"{time.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{id:D}"));
    public static (DateTimeOffset? Time, ConversationId? Id) DecodeConversation(string? cursor)
    { var value = Decode(cursor); return (value.Time, value.Id.HasValue ? new ConversationId(value.Id.Value) : null); }
    public static (DateTimeOffset? Time, MessageId? Id) DecodeMessage(string? cursor)
    { var value = Decode(cursor); return (value.Time, value.Id.HasValue ? new MessageId(value.Id.Value) : null); }
    private static (DateTimeOffset? Time, Guid? Id) Decode(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return (null, null);
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(cursor)).Split('|');
            return (new DateTimeOffset(long.Parse(parts[0], CultureInfo.InvariantCulture), TimeSpan.Zero), Guid.Parse(parts[1]));
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException)
        { throw new DomainRuleException("messaging.cursor_invalid", "Mesaj sayfalama imleci geçersiz."); }
    }
}
