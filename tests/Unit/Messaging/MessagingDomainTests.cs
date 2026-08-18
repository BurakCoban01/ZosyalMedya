using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Messaging;

public sealed class MessagingDomainTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void DirectConversationRequiresExactlyTwoDifferentMembers()
    {
        var member = new ConversationMemberId(Guid.NewGuid());
        var error = Assert.Throws<DomainRuleException>(() => Conversation.CreateDirect(ConversationId.New(), member, member, Now));
        Assert.Equal("messaging.members_invalid", error.Code);
    }

    [Fact]
    public void NonMemberCannotChangeGroupMembership()
    {
        var owner = new ConversationMemberId(Guid.NewGuid());
        var member = new ConversationMemberId(Guid.NewGuid());
        var conversation = Conversation.CreateGroup(ConversationId.New(), owner, [member], "Mimari ekibi", Now);
        var error = Assert.Throws<DomainRuleException>(() => conversation.AddMember(new(Guid.NewGuid()), new(Guid.NewGuid()), Now));
        Assert.Equal("messaging.not_member", error.Code);
    }

    [Fact]
    public void MessageEditDeleteAndReceiptsProtectTheirActorsAndWindows()
    {
        var sender = new MessageSenderId(Guid.NewGuid()); var recipient = Guid.NewGuid();
        var message = Message.Create(MessageId.New(), ConversationId.New(), sender, "Merhaba", [], null, [sender.Value, recipient], Now);
        Assert.Throws<DomainRuleException>(() => message.Edit(new(Guid.NewGuid()), "Yetkisiz", Now));
        message.MarkDelivered(recipient, Now.AddMinutes(1)); message.MarkRead(recipient, Now.AddMinutes(2));
        Assert.NotNull(message.Receipts.Single().ReadAtUtc);
        Assert.Throws<DomainRuleException>(() => message.Delete(sender, Now.AddDays(2)));
    }

    [Fact]
    public void RetentionRedactionClearsPrivatePayloadAfterTheUserDeleteWindowButPreservesReplyIdentity()
    {
        var sender = new MessageSenderId(Guid.NewGuid());
        var mediaId = Guid.NewGuid();
        var replyTo = MessageId.New();
        var message = Message.Create(MessageId.New(), ConversationId.New(), sender, "Süreli özel içerik",
            [mediaId], replyTo, [sender.Value, Guid.NewGuid()], Now);

        message.RedactForRetention(Now.AddDays(2));

        Assert.Equal(MessageStatus.Deleted, message.Status);
        Assert.Equal(string.Empty, message.Text);
        Assert.Empty(message.MediaIds);
        Assert.Equal(replyTo, message.ReplyToId);
        Assert.Equal(Now.AddDays(2), message.DeletedAtUtc);
    }
}
