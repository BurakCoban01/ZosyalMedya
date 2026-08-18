using System.Text.RegularExpressions;
using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Content.Domain.Posts;

public readonly record struct PostId(Guid Value) { public static PostId New() => new(Guid.NewGuid()); public override string ToString() => Value.ToString("D"); }
public readonly record struct ContentAuthorId(Guid Value) { public override string ToString() => Value.ToString("D"); }
public enum PostVisibility { Public, Followers, CloseFriends, Private }
public enum PostStatus { Draft, Scheduled, Published, Archived, Deleted }
public enum ShareKind { Original, Repost, Quote }
public sealed record PostPublished(PostId PostId, ContentAuthorId AuthorId, DateTimeOffset OccurredAtUtc) : IDomainEvent;
public sealed record PostDeleted(PostId PostId, ContentAuthorId AuthorId, DateTimeOffset OccurredAtUtc) : IDomainEvent;
public sealed class PostRevision
{
    private PostRevision() { Text = string.Empty; }
    private PostRevision(long revision, string text, string? linkUrl, string? contentWarning, DateTimeOffset editedAtUtc)
    { Revision = revision; Text = text; LinkUrl = linkUrl; ContentWarning = contentWarning; EditedAtUtc = editedAtUtc; }
    public long Revision { get; private set; }
    public string Text { get; private set; }
    public string? LinkUrl { get; private set; }
    public string? ContentWarning { get; private set; }
    public DateTimeOffset EditedAtUtc { get; private set; }
    internal static PostRevision Create(long revision, string text, string? linkUrl, string? warning, DateTimeOffset now) => new(revision, text, linkUrl, warning, now);
}

public sealed class Post : AggregateRoot<PostId>
{
    private static readonly Regex MentionRegex = new(@"(?<!\w)@([\p{L}\p{N}_.]{3,30})", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex HashtagRegex = new(@"(?<!\w)#([\p{L}\p{N}_]{2,64})", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private List<PostRevision> _revisions = [];
    private Post() : base(default) { Text = string.Empty; MediaIds = []; Mentions = []; Hashtags = []; }
    private Post(PostId id, ContentAuthorId authorId, string text, Guid[] mediaIds, PostVisibility visibility, ShareKind shareKind,
        PostId? originalPostId, string? linkUrl, string? warning, bool sensitive, PostStatus status, DateTimeOffset? publishAtUtc, DateTimeOffset now) : base(id)
    {
        AuthorId = authorId; Text = text; MediaIds = mediaIds; Visibility = visibility; ShareKind = shareKind; OriginalPostId = originalPostId;
        LinkUrl = linkUrl; ContentWarning = warning; IsSensitive = sensitive; Status = status; PublishAtUtc = publishAtUtc;
        Mentions = Extract(MentionRegex, text); Hashtags = Extract(HashtagRegex, text).Select(x => x.ToLowerInvariant()).ToArray();
        CreatedAtUtc = now; UpdatedAtUtc = now; PublishedAtUtc = status == PostStatus.Published ? now : null; Version = 1;
        if (status == PostStatus.Published) Raise(new PostPublished(id, authorId, now));
    }

    public ContentAuthorId AuthorId { get; private set; }
    public string Text { get; private set; }
    public Guid[] MediaIds { get; private set; }
    public string[] Mentions { get; private set; }
    public string[] Hashtags { get; private set; }
    public string? LinkUrl { get; private set; }
    public string? ContentWarning { get; private set; }
    public bool IsSensitive { get; private set; }
    public PostVisibility Visibility { get; private set; }
    public PostStatus Status { get; private set; }
    public ShareKind ShareKind { get; private set; }
    public PostId? OriginalPostId { get; private set; }
    public bool IsPinned { get; private set; }
    public DateTimeOffset? PublishAtUtc { get; private set; }
    public DateTimeOffset? PublishedAtUtc { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset UpdatedAtUtc { get; private set; }
    public IReadOnlyList<PostRevision> Revisions => _revisions.AsReadOnly();
    public long ViewCount { get; private set; }

    public static Post Create(PostId id, ContentAuthorId authorId, string? text, IEnumerable<Guid>? mediaIds,
        PostVisibility visibility, ShareKind shareKind, PostId? originalPostId, string? linkUrl, string? warning,
        bool sensitive, bool draft, DateTimeOffset? publishAtUtc, DateTimeOffset now)
    {
        if (authorId.Value == Guid.Empty) throw new DomainRuleException("content.author_invalid", "İçerik yazarı gereklidir.");
        var cleanText = CleanText(text); var media = (mediaIds ?? []).Distinct().Take(10).ToArray();
        // A repost intentionally carries no new body; its required
        // OriginalPostId is the content. Original and quote posts still need
        // text, media, or a link of their own.
        if (shareKind != ShareKind.Repost && cleanText.Length == 0 && media.Length == 0 && linkUrl is null)
            throw new DomainRuleException("content.empty", "Metin, medya veya bağlantı gereklidir.");
        if (shareKind != ShareKind.Original && originalPostId is null)
            throw new DomainRuleException("content.original_required", "Paylaşım için kaynak içerik gereklidir.");
        if (shareKind == ShareKind.Repost && cleanText.Length > 0)
            throw new DomainRuleException("content.repost_text_forbidden", "Yeniden paylaşım açıklama içeremez; açıklama için alıntı kullanın.");
        if (publishAtUtc.HasValue && publishAtUtc <= now)
            throw new DomainRuleException("content.schedule_invalid", "Planlanan yayın zamanı gelecekte olmalıdır.");
        var status = draft ? PostStatus.Draft : publishAtUtc.HasValue ? PostStatus.Scheduled : PostStatus.Published;
        return new(id, authorId, cleanText, media, visibility, shareKind, originalPostId, ValidateHttps(linkUrl),
            CleanWarning(warning), sensitive, status, publishAtUtc, now);
    }

    public void Edit(ContentAuthorId actorId, string? text, IEnumerable<Guid>? mediaIds, PostVisibility visibility,
        string? linkUrl, string? warning, bool sensitive, DateTimeOffset now)
    {
        EnsureAuthor(actorId); EnsureMutable(); var cleanText = CleanText(text); var media = (mediaIds ?? []).Distinct().Take(10).ToArray();
        if (cleanText.Length == 0 && media.Length == 0 && linkUrl is null) throw new DomainRuleException("content.empty", "İçerik boş olamaz.");
        _revisions.Add(PostRevision.Create(Version, Text, LinkUrl, ContentWarning, now));
        Text = cleanText; MediaIds = media; Visibility = visibility; LinkUrl = ValidateHttps(linkUrl); ContentWarning = CleanWarning(warning);
        IsSensitive = sensitive; Mentions = Extract(MentionRegex, cleanText); Hashtags = Extract(HashtagRegex, cleanText).Select(x => x.ToLowerInvariant()).ToArray(); UpdatedAtUtc = now; Version++;
    }

    public void PublishDue(DateTimeOffset now) { if (Status != PostStatus.Scheduled || PublishAtUtc > now) return; Status = PostStatus.Published; PublishedAtUtc = now; UpdatedAtUtc = now; Version++; Raise(new PostPublished(Id, AuthorId, now)); }
    public void Archive(ContentAuthorId actorId, DateTimeOffset now) { EnsureAuthor(actorId); EnsureNotDeleted(); Status = PostStatus.Archived; IsPinned = false; UpdatedAtUtc = now; Version++; }
    public void Restore(ContentAuthorId actorId, DateTimeOffset now) { EnsureAuthor(actorId); if (Status != PostStatus.Archived) throw new DomainRuleException("content.restore_invalid", "Yalnız arşivlenmiş içerik geri yüklenebilir."); Status = PostStatus.Published; UpdatedAtUtc = now; Version++; }
    public void Delete(ContentAuthorId actorId, DateTimeOffset now) { EnsureAuthor(actorId); EnsureNotDeleted(); Status = PostStatus.Deleted; Text = string.Empty; MediaIds = []; Mentions = []; Hashtags = []; LinkUrl = null; IsPinned = false; UpdatedAtUtc = now; Version++; Raise(new PostDeleted(Id, AuthorId, now)); }
    public void SetPinned(ContentAuthorId actorId, bool pinned, DateTimeOffset now) { EnsureAuthor(actorId); if (Status != PostStatus.Published) throw new DomainRuleException("content.pin_invalid", "Yalnız yayınlanmış içerik sabitlenebilir."); IsPinned = pinned; UpdatedAtUtc = now; Version++; }
    public bool CanReceiveEngagement => Status == PostStatus.Published;

    private void EnsureAuthor(ContentAuthorId actorId) { if (actorId != AuthorId) throw new DomainRuleException("content.forbidden", "Bu içerik yalnız yazarı tarafından değiştirilebilir."); }
    private void EnsureMutable() { if (Status is PostStatus.Deleted or PostStatus.Archived) throw new DomainRuleException("content.not_mutable", "Silinmiş veya arşivlenmiş içerik değiştirilemez."); }
    private void EnsureNotDeleted() { if (Status == PostStatus.Deleted) throw new DomainRuleException("content.deleted", "Silinmiş içerik değiştirilemez."); }
    private static string CleanText(string? value) { var clean = value?.Trim() ?? string.Empty; if (clean.Length > 5000) throw new DomainRuleException("content.text_too_long", "İçerik en fazla 5000 karakter olabilir."); return clean; }
    private static string? CleanWarning(string? value) { if (string.IsNullOrWhiteSpace(value)) return null; var clean = value.Trim(); if (clean.Length > 160) throw new DomainRuleException("content.warning_too_long", "İçerik uyarısı en fazla 160 karakter olabilir."); return clean; }
    private static string? ValidateHttps(string? value) { if (string.IsNullOrWhiteSpace(value)) return null; if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new DomainRuleException("content.link_invalid", "Bağlantı mutlak HTTPS adresi olmalıdır."); return uri.AbsoluteUri; }
    private static string[] Extract(Regex regex, string text) => regex.Matches(text).Select(x => x.Groups[1].Value).Distinct(StringComparer.OrdinalIgnoreCase).Take(30).ToArray();
}
