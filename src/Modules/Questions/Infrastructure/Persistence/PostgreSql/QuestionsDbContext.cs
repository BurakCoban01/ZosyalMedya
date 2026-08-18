using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql;

public sealed class QuestionsDbContext(DbContextOptions<QuestionsDbContext> options) : DbContext(options)
{
    public DbSet<Question> Questions => Set<Question>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddTransactionalOutbox();
        modelBuilder.HasDefaultSchema("questions");
        var id = new ValueConverter<QuestionId, Guid>(value => value.Value, value => new QuestionId(value));
        var user = new ValueConverter<QuestionUserId, Guid>(value => value.Value, value => new QuestionUserId(value));
        var entity = modelBuilder.Entity<Question>(); entity.ToTable("questions"); entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasConversion(id).ValueGeneratedNever();
        entity.Property(x => x.SenderId).HasConversion(user).IsRequired(); entity.Property(x => x.TargetId).HasConversion(user).IsRequired();
        entity.Property(x => x.Body).HasMaxLength(1000).IsRequired(); entity.Property(x => x.AnswerBody).HasMaxLength(5000).IsRequired();
        entity.Property(x => x.Audience).HasConversion<string>().HasMaxLength(20); entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        entity.Property(x => x.Version).IsConcurrencyToken(); entity.Ignore(x => x.DomainEvents);
        entity.HasIndex(x => new { x.TargetId, x.Status, x.CreatedAtUtc }); entity.HasIndex(x => new { x.SenderId, x.CreatedAtUtc });
        entity.HasIndex(x => new { x.Status, x.PublishAtUtc, x.Id });
    }
}
