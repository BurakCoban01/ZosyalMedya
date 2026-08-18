using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Messaging.Domain.Conversations;
using ZosyalMedya.Modules.Messaging.Domain.Messages;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.PostgreSql;

public sealed class MessagingDbContext(DbContextOptions<MessagingDbContext> options) : DbContext(options)
{
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddTransactionalOutbox();
        modelBuilder.HasDefaultSchema("messaging");
        var conversationId = new ValueConverter<ConversationId, Guid>(x => x.Value, x => new(x));
        var memberId = new ValueConverter<ConversationMemberId, Guid>(x => x.Value, x => new(x));
        var messageId = new ValueConverter<MessageId, Guid>(x => x.Value, x => new(x));
        var senderId = new ValueConverter<MessageSenderId, Guid>(x => x.Value, x => new(x));
        var optionalMessageId = new ValueConverter<MessageId?, Guid?>(x => x.HasValue ? x.Value.Value : null, x => x.HasValue ? new(x.Value) : null);

        var conversation = modelBuilder.Entity<Conversation>();
        conversation.ToTable("conversations"); conversation.HasKey(x => x.Id);
        conversation.Property(x => x.Id).HasConversion(conversationId).ValueGeneratedNever();
        conversation.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
        conversation.Property(x => x.Title).HasMaxLength(100);
        conversation.Property(x => x.Version).IsConcurrencyToken();
        conversation.Ignore(x => x.Members); conversation.Ignore(x => x.DomainEvents);
        conversation.OwnsMany<ConversationMember>("_members", members =>
        {
            members.ToTable("conversation_members"); members.WithOwner().HasForeignKey("ConversationId");
            members.HasKey("ConversationId", nameof(ConversationMember.UserId));
            members.Property(x => x.UserId).HasConversion(memberId);
            members.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            members.HasIndex(x => new { x.UserId, x.LeftAtUtc });
        });
        conversation.HasIndex(x => x.UpdatedAtUtc);

        var message = modelBuilder.Entity<Message>();
        message.ToTable("messages"); message.HasKey(x => x.Id);
        message.Property(x => x.Id).HasConversion(messageId).ValueGeneratedNever();
        message.Property(x => x.ConversationId).HasConversion(conversationId);
        message.Property(x => x.SenderId).HasConversion(senderId);
        message.Property(x => x.ReplyToId).HasConversion(optionalMessageId);
        message.Property(x => x.Text).HasMaxLength(5000);
        message.Property(x => x.MediaIds).HasColumnType("uuid[]");
        message.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        message.Property(x => x.Version).IsConcurrencyToken();
        message.Ignore(x => x.Receipts); message.Ignore(x => x.DomainEvents);
        message.OwnsMany<MessageReceipt>("_receipts", receipts =>
        {
            receipts.ToTable("message_receipts"); receipts.WithOwner().HasForeignKey("MessageId");
            receipts.HasKey("MessageId", nameof(MessageReceipt.UserId));
            receipts.HasIndex(x => new { x.UserId, x.ReadAtUtc });
        });
        message.HasIndex(x => new { x.ConversationId, x.CreatedAtUtc });
    }
}
