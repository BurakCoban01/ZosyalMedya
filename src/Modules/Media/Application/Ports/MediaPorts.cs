using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Media.Domain.Assets;

namespace ZosyalMedya.Modules.Media.Application.Ports;

public sealed record MediaLimits(long MaxFileBytes, long OwnerQuotaBytes);
public sealed record MediaProcessingLimits(long MaxImagePixels, int MaxVideoDurationSeconds);

public sealed class MediaProcessingGate(int maximumConcurrency) : IDisposable
{
    public static MediaProcessingGate Unbounded { get; } = new(int.MaxValue);
    private readonly SemaphoreSlim slots = new(Math.Max(1, maximumConcurrency), Math.Max(1, maximumConcurrency));

    public async ValueTask<IDisposable> AcquireAsync(CancellationToken cancellationToken = default)
    {
        await slots.WaitAsync(cancellationToken);
        return new Lease(slots);
    }

    public void Dispose() => slots.Dispose();

    private sealed class Lease(SemaphoreSlim slots) : IDisposable
    {
        private SemaphoreSlim? remaining = slots;
        public void Dispose() => Interlocked.Exchange(ref remaining, null)?.Release();
    }
}

public sealed class MediaIngestionGate(int maximumConcurrency) : IDisposable
{
    private readonly MediaProcessingGate gate = new(maximumConcurrency);
    public ValueTask<IDisposable> AcquireAsync(CancellationToken cancellationToken = default) =>
        gate.AcquireAsync(cancellationToken);
    public void Dispose() => gate.Dispose();
}

public interface IMediaRepository : IRepository<MediaAsset, MediaId>
{
    Task<long> SumActiveBytesAsync(MediaOwnerId ownerId, CancellationToken cancellationToken = default);
    Task<bool> TryCreateWithinQuotaAsync(MediaAsset entity, long quotaBytes,
        CancellationToken cancellationToken = default);
    Task<bool> TryUpdateStorageReservationWithinQuotaAsync(MediaAsset entity, long expectedVersion, long quotaBytes,
        CancellationToken cancellationToken = default) => throw new NotSupportedException();
    Task<IReadOnlyList<MediaAsset>> ListExpiredPendingAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken = default);
    Task<bool> TryMarkExpiredDeletedAsync(MediaId id, long expectedVersion, DateTimeOffset now,
        CancellationToken cancellationToken = default);
}

public interface IObjectStorage
{
    Task PutAsync(string key, Stream content, CancellationToken cancellationToken = default);
    Task<Stream> OpenReadAsync(string key, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
    Task<string> CreateReadUrlAsync(string key, TimeSpan lifetime, CancellationToken cancellationToken = default);
}

public sealed record ProcessedMedia(
    byte[] SanitizedOriginal,
    string OriginalContentType,
    IReadOnlyList<ProcessedVariant> Variants);

public sealed record ProcessedVariant(
    string Name,
    string ContentType,
    byte[] Bytes,
    int? Width,
    int? Height);

public interface IMediaProcessor
{
    Task<ProcessedMedia> ProcessAsync(Stream source, string contentType, CancellationToken cancellationToken = default);
}

public interface IAntivirusScanner
{
    Task<(bool Safe, string? Reason)> ScanAsync(Stream source, CancellationToken cancellationToken = default);
}
