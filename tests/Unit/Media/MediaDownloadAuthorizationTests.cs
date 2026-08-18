using System.Linq.Expressions;
using ZosyalMedya.BuildingBlocks.Application.Persistence;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Media;

public sealed class MediaDownloadAuthorizationTests
{
    [Fact]
    public async Task ProcessingGateDoesNotAdmitASecondUploadUntilTheFirstLeaseEnds()
    {
        using var gate = new MediaProcessingGate(1);
        using var first = await gate.AcquireAsync();
        var secondTask = gate.AcquireAsync().AsTask();

        Assert.False(secondTask.IsCompleted);
        first.Dispose();
        using var second = await secondTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task IngestionGateBoundsBufferedUploadsSeparatelyFromProcessing()
    {
        using var gate = new MediaIngestionGate(2);
        using var first = await gate.AcquireAsync();
        using var second = await gate.AcquireAsync();
        var thirdTask = gate.AcquireAsync().AsTask();

        Assert.False(thirdTask.IsCompleted);
        first.Dispose();
        using var third = await thirdTask.WaitAsync(TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task PrivateMediaRequiresAnExplicitOwnerContextGrant()
    {
        var owner = Guid.NewGuid(); var viewer = Guid.NewGuid(); var asset = ReadyPrivate(owner);
        var denied = await new DownloadMediaHandler(new Repository(asset), new Storage(), new Graph(), [])
            .HandleAsync(asset.Id.Value, viewer, null, default);
        var granted = await new DownloadMediaHandler(new Repository(asset), new Storage(), new Graph(), [new Grant(asset.Id.Value, viewer)])
            .HandleAsync(asset.Id.Value, viewer, null, default);

        Assert.False(denied.IsSuccess);
        Assert.Equal("media.forbidden", denied.Error.Code);
        Assert.True(granted.IsSuccess);
    }

    [Fact]
    public async Task RelationshipBlockRemainsAHardDenyDespiteAnExplicitGrant()
    {
        var owner = Guid.NewGuid(); var viewer = Guid.NewGuid(); var asset = ReadyPrivate(owner);
        var result = await new DownloadMediaHandler(new Repository(asset), new Storage(), new Graph(blocked: true),
                [new Grant(asset.Id.Value, viewer)])
            .HandleAsync(asset.Id.Value, viewer, null, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.forbidden", result.Error.Code);
    }

    [Fact]
    public async Task ActiveStoryReferencePreventsPhysicalMediaDeletion()
    {
        var owner = Guid.NewGuid(); var asset = ReadyPrivate(owner);
        asset.ClaimForStory(new(owner), Guid.NewGuid(), DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow);
        var result = await new DeleteMediaHandler(new Repository(asset), new Storage(), new Clock())
            .HandleAsync(asset.Id.Value, owner, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.reference_conflict", result.Error.Code);
        Assert.Equal(MediaStatus.Ready, asset.Status);
    }

    [Fact]
    public async Task ForeignOwnerCannotInferAnActiveStoryClaim()
    {
        var owner = Guid.NewGuid(); var asset = ReadyPrivate(owner);
        asset.ClaimForStory(new(owner), Guid.NewGuid(), DateTimeOffset.UtcNow.AddHours(1), DateTimeOffset.UtcNow);

        var result = await new DeleteMediaHandler(new Repository(asset), new Storage(), new Clock())
            .HandleAsync(asset.Id.Value, Guid.NewGuid(), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.forbidden", result.Error.Code);
    }

    [Fact]
    public async Task ConcurrentClaimWinningTheVersionRacePreventsPhysicalDeletion()
    {
        var owner = Guid.NewGuid(); var asset = ReadyPrivate(owner);
        var repository = new Repository(asset) { RejectUpdates = true };
        var storage = new Storage();

        var result = await new DeleteMediaHandler(repository, storage, new Clock())
            .HandleAsync(asset.Id.Value, owner, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.concurrency_conflict", result.Error.Code);
        Assert.Equal(0, storage.DeleteCalls);
    }

    [Fact]
    public async Task RepeatedDeleteOfAnAlreadyDeletedAssetIsIdempotent()
    {
        var owner = Guid.NewGuid(); var asset = ReadyPrivate(owner); var repository = new Repository(asset);
        var storage = new Storage(); var handler = new DeleteMediaHandler(repository, storage, new Clock());

        Assert.True((await handler.HandleAsync(asset.Id.Value, owner, default)).IsSuccess);
        Assert.True((await handler.HandleAsync(asset.Id.Value, owner, default)).IsSuccess);
        Assert.Equal(MediaStatus.Deleted, asset.Status);
        Assert.Equal(2, storage.DeleteCalls);
    }

    [Fact]
    public async Task ForeignOwnerCannotRetryDeletionOfAnAlreadyDeletedAsset()
    {
        var owner = Guid.NewGuid(); var asset = ReadyPrivate(owner); var repository = new Repository(asset);
        var storage = new Storage(); var handler = new DeleteMediaHandler(repository, storage, new Clock());
        Assert.True((await handler.HandleAsync(asset.Id.Value, owner, default)).IsSuccess);

        var result = await handler.HandleAsync(asset.Id.Value, Guid.NewGuid(), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.forbidden", result.Error.Code);
        Assert.Equal(1, storage.DeleteCalls);
    }

    [Fact]
    public async Task OversizedUploadStopsAfterExpectedSizePlusOneByte()
    {
        var owner=Guid.NewGuid();var asset=Pending(owner,3);var stream=new CountingStream(1_000_000);
        var result=await new UploadMediaHandler(new Repository(asset),new Storage(),new RejectingScanner(),new RejectingProcessor(),Limits(),new Clock())
            .HandleAsync(asset.Id.Value,owner,stream,default);
        Assert.False(result.IsSuccess);Assert.Equal("media.size_mismatch",result.Error.Code);Assert.Equal(4,stream.BytesRead);
    }

    [Fact]
    public async Task UploadLosingTheProcessingClaimDoesNotWriteObjects()
    {
        var owner = Guid.NewGuid(); var asset = Pending(owner, 3);
        var repository = new Repository(asset) { RejectUpdates = true }; var storage = new Storage();
        var result = await new UploadMediaHandler(repository, storage, new SafeScanner(), new SuccessfulProcessor(), Limits(), new Clock())
            .HandleAsync(asset.Id.Value, owner, new MemoryStream([1, 2, 3]), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.concurrency_conflict", result.Error.Code);
        Assert.Equal(0, storage.PutCalls);
    }

    [Fact]
    public async Task PartialObjectWriteIsCompensatedWhenALaterPutFails()
    {
        var owner = Guid.NewGuid(); var asset = Pending(owner, 3);
        var storage = new Storage { FailPutCall = 2 };

        await Assert.ThrowsAsync<IOException>(() => new UploadMediaHandler(new Repository(asset), storage,
                new SafeScanner(), new SuccessfulProcessor(), Limits(), new Clock())
            .HandleAsync(asset.Id.Value, owner, new MemoryStream([1, 2, 3]), default));

        Assert.Equal(2, storage.PutCalls);
        Assert.Equal(2, storage.DeletedKeys.Count);
        Assert.Contains(asset.StorageKey, storage.DeletedKeys);
        Assert.Contains($"{owner:N}/{asset.Id.Value:N}/w320.webp", storage.DeletedKeys);
        Assert.Equal(MediaStatus.Quarantined, asset.Status);
    }

    [Fact]
    public async Task ProcessedBytesAreReservedBeforeAnyObjectWrite()
    {
        var owner = Guid.NewGuid(); var asset = Pending(owner, 3); var storage = new Storage();

        var result = await new UploadMediaHandler(new Repository(asset), storage, new SafeScanner(),
                new SuccessfulProcessor(), new MediaLimits(1024, 4), new Clock())
            .HandleAsync(asset.Id.Value, owner, new MemoryStream([1, 2, 3]), default);

        Assert.False(result.IsSuccess);
        Assert.Equal("media.quota_exceeded", result.Error.Code);
        Assert.Equal(0, storage.PutCalls);
        Assert.Equal(5, asset.ReservedStorageBytes);
        Assert.Equal(MediaStatus.Quarantined, asset.Status);
    }

    private static MediaAsset ReadyPrivate(Guid owner)
    {
        var now = DateTimeOffset.UtcNow;
        var item = MediaAsset.Initiate(MediaId.New(), new(owner), "message.png", "image/png", 3,
            MediaVisibility.Private, "message/original", 10, now);
        item.BeginProcessing(new(owner), 3, "hash", now);
        item.Complete(new(owner), [], now);
        return item;
    }

    private static MediaAsset Pending(Guid owner,long size)=>MediaAsset.Initiate(MediaId.New(),new(owner),"upload.png","image/png",size,MediaVisibility.Private,"upload/original",1024,DateTimeOffset.UtcNow);
    private static MediaLimits Limits() => new(1024, 1024);

    private sealed class Grant(Guid mediaId, Guid viewerId) : IMediaAccessGrantProvider
    {
        public Task<bool> CanViewAsync(Guid candidateMediaId, Guid? candidateViewerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(candidateMediaId == mediaId && candidateViewerId == viewerId);
    }

    private sealed class Clock : ZosyalMedya.BuildingBlocks.Domain.IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    }

    private sealed class Graph(bool blocked = false) : ISocialGraphModule
    {
        public Task<RelationshipLookup> GetAsync(Guid actorId, Guid targetId, CancellationToken cancellationToken = default) =>
            Task.FromResult(new RelationshipLookup(actorId, targetId, false, false, blocked, false, false));
        public Task<IReadOnlySet<Guid>> ListFollowingIdsAsync(Guid actorId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlySet<Guid>>(new HashSet<Guid>());
    }

    private sealed class Storage : IObjectStorage
    {
        public int DeleteCalls { get; private set; }
        public int PutCalls { get; private set; }
        public int? FailPutCall { get; init; }
        public List<string> DeletedKeys { get; } = [];
        public Task PutAsync(string key, Stream content, CancellationToken cancellationToken = default)
        {
            PutCalls++;
            if (PutCalls == FailPutCall) throw new IOException("simulated storage failure");
            return Task.CompletedTask;
        }
        public Task<Stream> OpenReadAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult<Stream>(new MemoryStream([1,2,3]));
        public Task DeleteAsync(string key, CancellationToken cancellationToken = default) { DeleteCalls++; DeletedKeys.Add(key); return Task.CompletedTask; }
        public Task<string> CreateReadUrlAsync(string key, TimeSpan lifetime, CancellationToken cancellationToken = default) => Task.FromResult(string.Empty);
    }

    private sealed class RejectingScanner:IAntivirusScanner{public Task<(bool Safe,string? Reason)> ScanAsync(Stream source,CancellationToken cancellationToken=default)=>throw new InvalidOperationException("Oversized content must not be scanned.");}
    private sealed class RejectingProcessor:IMediaProcessor{public Task<ProcessedMedia> ProcessAsync(Stream source,string contentType,CancellationToken cancellationToken=default)=>throw new InvalidOperationException("Oversized content must not be processed.");}
    private sealed class SafeScanner:IAntivirusScanner{public Task<(bool Safe,string? Reason)> ScanAsync(Stream source,CancellationToken cancellationToken=default)=>Task.FromResult<(bool,string?)>((true,null));}
    private sealed class SuccessfulProcessor:IMediaProcessor{public Task<ProcessedMedia> ProcessAsync(Stream source,string contentType,CancellationToken cancellationToken=default)=>Task.FromResult(new ProcessedMedia([1,2,3],contentType,[new("w320.webp","image/webp",[4,5],1,1)]));}
    private sealed class CountingStream(long length):Stream
    {public long BytesRead{get;private set;}public override bool CanRead=>true;public override bool CanSeek=>false;public override bool CanWrite=>false;public override long Length=>length;public override long Position{get=>BytesRead;set=>throw new NotSupportedException();}public override int Read(byte[] buffer,int offset,int count){var read=(int)Math.Min(count,length-BytesRead);if(read<=0)return 0;Array.Fill<byte>(buffer,1,offset,read);BytesRead+=read;return read;}public override ValueTask<int> ReadAsync(Memory<byte> buffer,CancellationToken cancellationToken=default){var read=(int)Math.Min(buffer.Length,length-BytesRead);if(read<=0)return ValueTask.FromResult(0);buffer.Span[..read].Fill(1);BytesRead+=read;return ValueTask.FromResult(read);}public override void Flush(){}public override long Seek(long offset,SeekOrigin origin)=>throw new NotSupportedException();public override void SetLength(long value)=>throw new NotSupportedException();public override void Write(byte[] buffer,int offset,int count)=>throw new NotSupportedException();}

    private sealed class Repository(MediaAsset asset) : IMediaRepository
    {
        public bool RejectUpdates { get; init; }
        public Task<MediaAsset?> SelectAsync(Expression<Func<MediaAsset, bool>> predicate, CancellationToken cancellationToken = default) => Task.FromResult<MediaAsset?>(predicate.Compile()(asset) ? asset : null);
        public Task<IReadOnlyList<MediaAsset>> ListByFilterAsync(Expression<Func<MediaAsset, bool>> predicate, QueryOptions<MediaAsset>? options = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<MediaId> CreateAsync(MediaAsset entity, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(Expression<Func<MediaAsset, bool>> predicate, MediaAsset replacement, long? expectedVersion = null, CancellationToken cancellationToken = default) => Task.FromResult(!RejectUpdates);
        public Task<long> DeleteByFilterAsync(Expression<Func<MediaAsset, bool>> predicate, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<long> SumActiveBytesAsync(MediaOwnerId ownerId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> TryCreateWithinQuotaAsync(MediaAsset entity,long quotaBytes,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
        public Task<bool> TryUpdateStorageReservationWithinQuotaAsync(MediaAsset entity,long expectedVersion,long quotaBytes,CancellationToken cancellationToken=default)=>
            Task.FromResult(entity.ReservedStorageBytes <= quotaBytes);
        public Task<IReadOnlyList<MediaAsset>> ListExpiredPendingAsync(DateTimeOffset now, int limit, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> TryMarkExpiredDeletedAsync(MediaId id,long expectedVersion,DateTimeOffset now,CancellationToken cancellationToken=default)=>throw new NotSupportedException();
    }
}
