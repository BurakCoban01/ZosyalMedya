using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Stories.Domain.Stories;

namespace ZosyalMedya.Modules.Stories.Application.Ports;

public sealed record StoryPageQuery(StoryOwnerId? OwnerId, DateTimeOffset Now, DateTimeOffset? BeforeTime,
    StoryId? BeforeId, int Limit);

public interface IStoryRepository : IRepository<Story, StoryId>
{
    Task<IReadOnlyList<Story>> ListPageAsync(StoryPageQuery query, CancellationToken cancellationToken = default);
    Task<Story?> FindActiveByMediaAsync(Guid mediaId, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}
