using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Domain.Polls;
using ZosyalMedya.Modules.Content.Domain.Saved;

namespace ZosyalMedya.Modules.Content.Application.Ports;

/// <summary>
/// Akış sorgusunun sağlayıcıdan bağımsız keyset ölçütlerini taşır.
/// Sıra her adaptörde PublishedAtUtc azalan, Id artan olarak uygulanır.
/// </summary>
public sealed record PostFeedQuery(
    IReadOnlySet<ContentAuthorId>? AuthorIds,
    bool PublicOnly,
    DateTimeOffset? CursorPublishedAtUtc,
    PostId? CursorId,
    int Limit);

public interface IPostRepository : IRepository<Post, PostId>
{
    Task<IReadOnlyList<Post>> ListFeedPageAsync(
        PostFeedQuery request,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Post>> ListDueScheduledAsync(DateTimeOffset now, int limit,
        CancellationToken cancellationToken = default);
}

public sealed record SavedContentPageQuery(Guid OwnerId, string? Collection, DateTimeOffset? CursorCreatedAtUtc,
    SavedContentId? CursorId, int Limit);
public interface ISavedContentRepository : IRepository<SavedContent, SavedContentId>
{
    Task<IReadOnlyList<SavedContent>> ListPageAsync(SavedContentPageQuery request,
        CancellationToken cancellationToken = default);
}

public interface IPollRepository
{
    Task<Poll?> GetByPostAsync(PostId postId, CancellationToken cancellationToken = default);
    Task<IReadOnlySet<PostId>> ListExistingPostIdsAsync(IReadOnlySet<PostId> postIds,
        CancellationToken cancellationToken = default);
    Task CreateAsync(Poll poll, CancellationToken cancellationToken = default);
    Task<PollVoteOutcome> CastVoteAsync(PollId pollId, Guid actorId, IReadOnlySet<PollOptionId> optionIds,
        DateTimeOffset now, CancellationToken cancellationToken = default);
}

public interface IPostImpressionRepository
{
    Task<bool> RecordUniqueAsync(PostId postId, string viewerHash, DateOnly utcDay,
        CancellationToken cancellationToken = default);
}
