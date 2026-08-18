using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Contracts;

namespace ZosyalMedya.Modules.Messaging.Domain.Messages;

public readonly record struct MessageId(Guid Value) { public static MessageId New() => new(Guid.NewGuid()); }
public readonly record struct MessageSenderId(Guid Value);
public enum MessageStatus { Sent, Deleted }

public sealed class MessageReceipt
{
    private MessageReceipt() { }
    internal MessageReceipt(Guid userId) => UserId = userId;
    public Guid UserId { get; private set; }
    public DateTimeOffset? DeliveredAtUtc { get; private set; }
    public DateTimeOffset? ReadAtUtc { get; private set; }
    internal void Deliver(DateTimeOffset now) => DeliveredAtUtc ??= now;
    internal void Read(DateTimeOffset now) { DeliveredAtUtc ??= now; ReadAtUtc ??= now; }
}

public sealed class Message : AggregateRoot<MessageId>
{
    private List<MessageReceipt> _receipts = [];
    private Message() : base(default) { Text = string.Empty; MediaIds = []; }
    private Message(MessageId id, ConversationId conversationId, MessageSenderId senderId, string text,
        IEnumerable<Guid>? mediaIds, MessageId? replyToId, IEnumerable<Guid> recipients, DateTimeOffset now) : base(id)
    {
        ConversationId = conversationId; SenderId = senderId; Text = ValidateBody(text, mediaIds);
        MediaIds = (mediaIds ?? []).Distinct().Take(10).ToArray(); ReplyToId = replyToId;
        Status = MessageStatus.Sent; CreatedAtUtc = now; UpdatedAtUtc = now; Version = 1;
        _receipts.AddRange(recipients.Where(x => x != senderId.Value).Distinct().Select(x => new MessageReceipt(x)));
    }

    public ConversationId ConversationId { get; private set; }
    public MessageSenderId SenderId { get; private set; }
    public string Text { get; private set; }
    public Guid[] MediaIds { get; private set; }
    public MessageId? ReplyToId { get; private set; }
    public MessageStatus Status { get; private set; }
    public IReadOnlyList<MessageReceipt> Receipts => _receipts.AsReadOnly();
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public DateTimeOffset? DeletedAtUtc { get; private set; }

    public static Message Create(MessageId id, ConversationId conversationId, MessageSenderId senderId,
        string text, IEnumerable<Guid>? mediaIds, MessageId? replyToId, IEnumerable<Guid> recipients, DateTimeOffset now)
    {
        if (conversationId.Value == Guid.Empty || senderId.Value == Guid.Empty)
            throw new DomainRuleException("messaging.reference_invalid", "Konuşma ve gönderen gereklidir.");
        var message = new Message(id, conversationId, senderId, text, mediaIds, replyToId, recipients, now);
        var preview = message.Text.Length <= 120 ? message.Text : string.Concat(message.Text.AsSpan(0, 117), "…");
        message.Raise(new MessageSentIntegrationEvent(id.Value, conversationId.Value, senderId.Value,
            recipients.Where(x => x != senderId.Value).Distinct().ToArray(), preview, now));
        return message;
    }

    public void Edit(MessageSenderId actor, string text, DateTimeOffset now)
    {
        EnsureSender(actor); EnsureActive();
        if (now - CreatedAtUtc > TimeSpan.FromMinutes(15))
            throw new DomainRuleException("messaging.edit_window_closed", "Mesaj düzenleme süresi doldu.");
        Text = ValidateBody(text, MediaIds); UpdatedAtUtc = now; Version++;
    }

    public void Delete(MessageSenderId actor, DateTimeOffset now)
    {
        EnsureSender(actor); if (Status == MessageStatus.Deleted) return;
        if (now - CreatedAtUtc > TimeSpan.FromHours(24))
            throw new DomainRuleException("messaging.delete_window_closed", "Mesajı herkesten silme süresi doldu.");
        Status = MessageStatus.Deleted; Text = string.Empty; MediaIds = []; DeletedAtUtc = now; UpdatedAtUtc = now; Version++;
    }

    public void RedactForRetention(DateTimeOffset now)
    {
        if (Status == MessageStatus.Deleted) return;
        Status = MessageStatus.Deleted; Text = string.Empty; MediaIds = []; DeletedAtUtc = now; UpdatedAtUtc = now; Version++;
    }

    public void MarkDelivered(Guid userId, DateTimeOffset now) { RequireReceipt(userId).Deliver(now); UpdatedAtUtc = now; Version++; }
    public void MarkRead(Guid userId, DateTimeOffset now) { RequireReceipt(userId).Read(now); UpdatedAtUtc = now; Version++; }
    private MessageReceipt RequireReceipt(Guid userId) => _receipts.SingleOrDefault(x => x.UserId == userId) ??
        throw new DomainRuleException("messaging.receipt_forbidden", "Bu kullanıcı için teslim bilgisi yok.");
    private void EnsureSender(MessageSenderId actor) { if (actor != SenderId) throw new DomainRuleException("messaging.message_forbidden", "Mesajı yalnız gönderen değiştirebilir."); }
    private void EnsureActive() { if (Status == MessageStatus.Deleted) throw new DomainRuleException("messaging.message_deleted", "Silinmiş mesaj değiştirilemez."); }
    private static string ValidateBody(string text, IEnumerable<Guid>? mediaIds)
    {
        var value = text.Trim(); var hasMedia = mediaIds?.Any() == true;
        if (value.Length == 0 && !hasMedia) throw new DomainRuleException("messaging.body_required", "Metin veya medya gereklidir.");
        if (value.Length > 5000) throw new DomainRuleException("messaging.body_too_long", "Mesaj en fazla 5000 karakter olabilir.");
        return value;
    }
}
