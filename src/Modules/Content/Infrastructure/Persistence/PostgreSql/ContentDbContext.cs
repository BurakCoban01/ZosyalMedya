using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Saved;
namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Poll> Polls => Set<Poll>();
    internal DbSet<PollBallot> PollBallots => Set<PollBallot>();
    public DbSet<SavedContent> SavedContents => Set<SavedContent>();
    internal DbSet<PostImpression> PostImpressions => Set<PostImpression>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddTransactionalOutbox();
        modelBuilder.HasDefaultSchema("content");
        var id = new ValueConverter<PostId, Guid>(x => x.Value, x => new PostId(x));
        var author = new ValueConverter<ContentAuthorId, Guid>(x => x.Value, x => new ContentAuthorId(x));
        var optionalId = new ValueConverter<PostId?, Guid?>(x => x.HasValue ? x.Value.Value : null, x => x.HasValue ? new PostId(x.Value) : null);
        var post = modelBuilder.Entity<Post>(); post.ToTable("posts"); post.HasKey(x => x.Id);
        post.Property(x => x.Id).HasConversion(id).ValueGeneratedNever(); post.Property(x => x.AuthorId).HasConversion(author).IsRequired();
        post.Property(x => x.OriginalPostId).HasConversion(optionalId); post.Property(x => x.Text).HasMaxLength(5000).IsRequired();
        post.Property(x => x.MediaIds).HasColumnType("uuid[]").IsRequired(); post.Property(x => x.Mentions).HasColumnType("text[]").IsRequired(); post.Property(x => x.Hashtags).HasColumnType("text[]").IsRequired();
        post.Property(x => x.LinkUrl).HasMaxLength(2048); post.Property(x => x.ContentWarning).HasMaxLength(160);
        post.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(24); post.Property(x => x.Status).HasConversion<string>().HasMaxLength(24); post.Property(x => x.ShareKind).HasConversion<string>().HasMaxLength(16);
        post.Property(x => x.Version).IsConcurrencyToken(); post.Ignore(x => x.DomainEvents); post.Ignore(x => x.Revisions);
        post.OwnsMany<PostRevision>("_revisions", revisions => { revisions.ToTable("post_revisions"); revisions.WithOwner().HasForeignKey("PostId"); revisions.HasKey("PostId", nameof(PostRevision.Revision)); revisions.Property(x => x.Text).HasMaxLength(5000); revisions.Property(x => x.LinkUrl).HasMaxLength(2048); revisions.Property(x => x.ContentWarning).HasMaxLength(160); });
        post.HasIndex(x => new { x.AuthorId, x.Status, x.PublishedAtUtc }); post.HasIndex(x => new { x.Status, x.Visibility, x.PublishedAtUtc }); post.HasIndex(x => x.OriginalPostId);

        var pollId = new ValueConverter<PollId, Guid>(x => x.Value, x => new PollId(x));
        var optionId = new ValueConverter<PollOptionId, Guid>(x => x.Value, x => new PollOptionId(x));
        var poll = modelBuilder.Entity<Poll>(); poll.ToTable("polls"); poll.HasKey(x => x.Id);
        poll.Property(x => x.Id).HasConversion(pollId).ValueGeneratedNever(); poll.Property(x => x.PostId).HasConversion(id);
        poll.Property(x => x.AuthorId).HasConversion(author); poll.Property(x => x.Question).HasMaxLength(240);
        poll.Property(x => x.Version).IsConcurrencyToken(); poll.Ignore(x => x.Options); poll.Ignore(x => x.DomainEvents);
        poll.HasIndex(x => x.PostId).IsUnique(); poll.HasIndex(x => x.ClosesAtUtc);
        poll.HasOne<Post>().WithOne().HasForeignKey<Poll>(x => x.PostId).OnDelete(DeleteBehavior.Cascade);
        poll.OwnsMany<PollOption>("_options", options => { options.ToTable("poll_options"); options.WithOwner().HasForeignKey("PollId"); options.HasKey("PollId", nameof(PollOption.Id)); options.Property(x => x.Id).HasConversion(optionId); options.Property(x => x.Text).HasMaxLength(120); });
        var ballot = modelBuilder.Entity<PollBallot>(); ballot.ToTable("poll_ballots"); ballot.HasKey(x => new { x.PollId, x.ActorId });
        ballot.Property(x => x.PollId).HasConversion(pollId); ballot.Property(x => x.OptionIds).HasColumnType("uuid[]");
        ballot.HasOne<Poll>().WithMany().HasForeignKey(x => x.PollId).OnDelete(DeleteBehavior.Cascade);
        var savedId = new ValueConverter<SavedContentId, Guid>(x => x.Value, x => new SavedContentId(x));
        var saved = modelBuilder.Entity<SavedContent>(); saved.ToTable("saved_content"); saved.HasKey(x => x.Id);
        saved.Property(x => x.Id).HasConversion(savedId).ValueGeneratedNever(); saved.Property(x => x.PostId).HasConversion(id);
        saved.Property(x => x.Collection).HasMaxLength(80); saved.Property(x => x.Version).IsConcurrencyToken(); saved.Ignore(x => x.DomainEvents);
        saved.HasIndex(x => new { x.OwnerId, x.PostId, x.Collection }).IsUnique(); saved.HasIndex(x => new { x.OwnerId, x.Collection, x.CreatedAtUtc });
        saved.HasOne<Post>().WithMany().HasForeignKey(x => x.PostId).OnDelete(DeleteBehavior.Cascade);
        var impression = modelBuilder.Entity<PostImpression>(); impression.ToTable("post_impressions");
        impression.HasKey(x => new { x.PostId, x.ViewerHash, x.UtcDay }); impression.Property(x => x.PostId).HasConversion(id);
        impression.Property(x => x.ViewerHash).HasMaxLength(64); impression.HasOne<Post>().WithMany().HasForeignKey(x => x.PostId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PostImpression
{
    private PostImpression() { ViewerHash = string.Empty; }
    public PostImpression(PostId postId, string viewerHash, DateOnly utcDay, DateTimeOffset recordedAtUtc)
    { PostId = postId; ViewerHash = viewerHash; UtcDay = utcDay; RecordedAtUtc = recordedAtUtc; }
    public PostId PostId { get; private set; } public string ViewerHash { get; private set; }
    public DateOnly UtcDay { get; private set; } public DateTimeOffset RecordedAtUtc { get; private set; }
}

internal sealed class PollBallot
{
    private PollBallot() { OptionIds = []; }
    public PollBallot(PollId pollId, Guid actorId, IEnumerable<PollOptionId> optionIds, DateTimeOffset castAtUtc)
    { PollId = pollId; ActorId = actorId; OptionIds = optionIds.Select(x => x.Value).ToArray(); CastAtUtc = castAtUtc; }
    public PollId PollId { get; private set; }
    public Guid ActorId { get; private set; }
    public Guid[] OptionIds { get; private set; }
    public DateTimeOffset CastAtUtc { get; private set; }
}
