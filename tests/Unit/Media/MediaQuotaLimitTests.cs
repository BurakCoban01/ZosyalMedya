using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Domain.Assets;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Media;

public sealed class MediaQuotaLimitTests
{
    [Fact]
    public async Task InitiationUsesConfiguredFileAndOwnerLimits()
    {
        var repository = new Repository();
        var handler = new InitiateMediaHandler(repository, new MediaLimits(25, 256), new Clock());

        var accepted = await handler.HandleAsync(Guid.NewGuid(), "photo.png", "image/png", 25,
            MediaVisibility.Private, default);
        var oversized = await handler.HandleAsync(Guid.NewGuid(), "large.png", "image/png", 26,
            MediaVisibility.Private, default);

        Assert.True(accepted.IsSuccess);
        Assert.Equal(256, repository.LastQuotaBytes);
        Assert.Equal("media.size_invalid", oversized.Error.Code);
        Assert.Equal(1, repository.Reservations);
    }

    private sealed class Clock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 8, 17, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class Repository : IMediaRepository
    {
        public int Reservations { get; private set; }
        public long LastQuotaBytes { get; private set; }
        public Task<bool> TryCreateWithinQuotaAsync(MediaAsset entity, long quotaBytes,
            CancellationToken cancellationToken = default)
        {
            Reservations++;
            LastQuotaBytes = quotaBytes;
            return Task.FromResult(true);
        }
        public Task<long> SumActiveBytesAsync(MediaOwnerId ownerId, CancellationToken cancellationToken = default) => Task.FromResult(0L);
        public Task<IReadOnlyList<MediaAsset>> ListExpiredPendingAsync(DateTimeOffset now, int limit,
            CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<MediaAsset>>([]);
        public Task<bool> TryMarkExpiredDeletedAsync(MediaId id, long expectedVersion, DateTimeOffset now,
            CancellationToken cancellationToken = default) => Task.FromResult(false);
        public Task<MediaAsset?> SelectAsync(Expression<Func<MediaAsset, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult<MediaAsset?>(null);
        public Task<IReadOnlyList<MediaAsset>> ListByFilterAsync(Expression<Func<MediaAsset, bool>> predicate,
            QueryOptions<MediaAsset>? options = null, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<MediaAsset>>([]);
        public Task<MediaId> CreateAsync(MediaAsset entity, CancellationToken cancellationToken = default) => Task.FromResult(entity.Id);
        public Task<bool> UpdateAsync(Expression<Func<MediaAsset, bool>> predicate, MediaAsset replacement,
            long? expectedVersion = null, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<long> DeleteByFilterAsync(Expression<Func<MediaAsset, bool>> predicate,
            CancellationToken cancellationToken = default) => Task.FromResult(0L);
    }
}
