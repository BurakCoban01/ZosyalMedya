using System.Buffers.Binary;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SkiaSharp;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.Media.Infrastructure;
using ZosyalMedya.Modules.Media.Infrastructure.Persistence;
using ZosyalMedya.Modules.Media.Infrastructure.Processing;
using ZosyalMedya.Modules.Media.Infrastructure.Storage;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Media;

public sealed class MediaInfrastructureTests
{
    [Fact]
    public async Task ProcessorValidatesSignatureStripsMetadataAndCreatesVariants()
    {
        using var bitmap = new SKBitmap(8, 4);
        bitmap.Erase(SKColors.Coral);
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);
        var bytes = encoded.ToArray();
        var processor = new SkiaMediaProcessor();
        var result = await processor.ProcessAsync(new MemoryStream(bytes), "image/png");
        Assert.Equal("image/png", result.OriginalContentType);
        Assert.Equal(2, result.Variants.Count);
        Assert.All(result.Variants, variant => Assert.Equal("image/webp", variant.ContentType));
        await Assert.ThrowsAsync<InvalidDataException>(() =>
            processor.ProcessAsync(new MemoryStream(bytes), "image/jpeg"));
    }

    [Fact]
    public async Task ProcessorRejectsImagePixelsAndVideoDurationBeforeProducingOutput()
    {
        using var bitmap = new SKBitmap(8, 4);
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100);
        var strict = new SkiaMediaProcessor(new(31, 90));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            strict.ProcessAsync(new MemoryStream(encoded.ToArray()), "image/png"));
        await Assert.ThrowsAsync<InvalidDataException>(() =>
            strict.ProcessAsync(new MemoryStream(Mp4(seconds: 91)), "video/mp4"));
        await Assert.ThrowsAsync<InvalidDataException>(() =>
            strict.ProcessAsync(new MemoryStream(Mp4(seconds: 91, forgedPrefixSeconds: 1)), "video/mp4"));
        var accepted = await strict.ProcessAsync(new MemoryStream(Mp4(seconds: 90)), "video/mp4");
        Assert.Equal("video/mp4", accepted.OriginalContentType);
        var fixturePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "../../../../../scripts/fixtures/media/data-studio-motion.mp4"));
        await using var fixture = File.OpenRead(fixturePath);
        var fixtureResult = await strict.ProcessAsync(fixture, "video/mp4");
        Assert.Equal("video/mp4", fixtureResult.OriginalContentType);
    }

    [Fact]
    public async Task LocalAdaptersRejectEicarAndPathTraversal()
    {
        var scanner = new LocalAntivirusScanner();
        var scan = await scanner.ScanAsync(new MemoryStream("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"u8.ToArray()));
        Assert.False(scan.Safe);
        var root = Path.Combine(Path.GetTempPath(), "zosyal-media-tests", Guid.NewGuid().ToString("N"));
        var storage = new FileSystemObjectStorage(Options.Create(new MediaOptions
        {
            PostgreSqlConnectionString = "unused",
            FileSystemRoot = root
        }));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            storage.PutAsync("../../escape", new MemoryStream([1, 2, 3])));
        await storage.PutAsync("owner/media/original", new MemoryStream([1, 2, 3]));
        await using var loaded = await storage.OpenReadAsync("owner/media/original");
        Assert.Equal(3, loaded.Length);
    }

    [Fact]
    public async Task PostgreSqlRepositoryPersistsVariantsAndConcurrency()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        await using var db = new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
        await db.Database.MigrateAsync();
        var repository = new PostgreSqlMediaRepository(db);
        var now = DateTimeOffset.UtcNow;
        var owner = new MediaOwnerId(Guid.NewGuid());
        var asset = MediaAsset.Initiate(MediaId.New(), owner, "contract.png", "image/png", 32,
            MediaVisibility.Private, $"{owner.Value:N}/contract/original", 1024, now);
        await repository.CreateAsync(asset);
        var expected = asset.Version;
        asset.BeginProcessing(owner, 32, new string('a', 64), now);
        var variants = new[] { MediaVariant.Create("w320.webp", $"{owner.Value:N}/contract/w320.webp", "image/webp", 12, 8, 8) };
        asset.StageVariants(owner, variants, now);
        Assert.True(await repository.UpdateAsync(x => x.Id == asset.Id, asset, expected));
        Assert.False(await repository.UpdateAsync(x => x.Id == asset.Id, asset, expected));
        var reservationVersion = asset.Version;
        asset.ReserveProcessedStorage(owner, 44, now);
        Assert.True(await repository.TryUpdateStorageReservationWithinQuotaAsync(asset, reservationVersion, 100));
        var completeVersion = asset.Version;
        asset.Complete(owner, variants, now);
        Assert.True(await repository.UpdateAsync(x => x.Id == asset.Id, asset, completeVersion));
        var loaded = await repository.SelectAsync(x => x.Id == asset.Id);
        Assert.NotNull(loaded);
        Assert.Single(loaded.Variants);
        Assert.Equal(44, await repository.SumActiveBytesAsync(owner));

        var staleDelete = await repository.SelectAsync(x => x.Id == asset.Id);
        var claimWinner = await repository.SelectAsync(x => x.Id == asset.Id);
        Assert.NotNull(staleDelete); Assert.NotNull(claimWinner);
        var storyId = Guid.NewGuid(); var claimVersion = claimWinner.Version;
        claimWinner.ClaimForStory(owner, storyId, now.AddHours(24), now);
        Assert.True(await repository.UpdateAsync(x => x.Id == asset.Id, claimWinner, claimVersion));
        var deleteVersion = staleDelete.Version; staleDelete.Delete(owner, now);
        Assert.False(await repository.UpdateAsync(x => x.Id == asset.Id, staleDelete, deleteVersion));
        var protectedAsset = await repository.SelectAsync(x => x.Id == asset.Id);
        Assert.Equal(MediaStatus.Ready, protectedAsset!.Status);
        Assert.Equal(storyId, protectedAsset.StoryClaimId);
        Assert.Equal(1, await repository.DeleteByFilterAsync(x => x.Id == asset.Id));
    }

    [Fact]
    public async Task PostgreSqlRepositorySerializesConcurrentQuotaReservations()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        const string connection="Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        var owner=new MediaOwnerId(Guid.NewGuid());var now=DateTimeOffset.UtcNow;
        async Task<bool> Reserve(string name)
        {
            await using var db=new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(connection).Options);
            var repository=new PostgreSqlMediaRepository(db);
            var asset=MediaAsset.Initiate(MediaId.New(),owner,name,"image/png",60,MediaVisibility.Private,$"{owner.Value:N}/{name}",100,now);
            return await repository.TryCreateWithinQuotaAsync(asset,100);
        }
        var results=await Task.WhenAll(Reserve("one.png"),Reserve("two.png"));
        Assert.Single(results,value=>value);
        await using var cleanupDb=new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(connection).Options);
        var cleanup=new PostgreSqlMediaRepository(cleanupDb);
        Assert.Equal(60,await cleanup.SumActiveBytesAsync(owner));
        Assert.Equal(1,await cleanup.DeleteByFilterAsync(x=>x.OwnerId==owner));
    }

    [Fact]
    public async Task ExpiredCleanupClaimCannotDeleteAJustReadyAsset()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        const string connection="Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        await using var db=new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(connection).Options);
        var repository=new PostgreSqlMediaRepository(db);var owner=new MediaOwnerId(Guid.NewGuid());
        var createdAt=DateTimeOffset.UtcNow.AddHours(-2);
        var asset=MediaAsset.Initiate(MediaId.New(),owner,"race.png","image/png",3,MediaVisibility.Private,
            $"{owner.Value:N}/race/original",10,createdAt);
        await repository.CreateAsync(asset);
        var stale=await repository.SelectAsync(x=>x.Id==asset.Id);
        var winner=await repository.SelectAsync(x=>x.Id==asset.Id);
        Assert.NotNull(stale);Assert.NotNull(winner);
        var expected=winner.Version;
        winner.BeginProcessing(owner,3,"hash",DateTimeOffset.UtcNow);
        winner.Complete(owner,[],DateTimeOffset.UtcNow);
        Assert.True(await repository.UpdateAsync(x=>x.Id==winner.Id,winner,expected));

        Assert.False(await repository.TryMarkExpiredDeletedAsync(stale.Id,stale.Version,DateTimeOffset.UtcNow));
        Assert.Equal(MediaStatus.Ready,(await repository.SelectAsync(x=>x.Id==asset.Id))!.Status);
        Assert.Equal(1,await repository.DeleteByFilterAsync(x=>x.Id==asset.Id));
    }

    private static byte[] Mp4(uint seconds, uint? forgedPrefixSeconds = null)
    {
        var prefixLength = forgedPrefixSeconds.HasValue ? 36 : 0;
        var bytes = new byte[48 + prefixLength];
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(0, 4), 12);
        "ftyp"u8.CopyTo(bytes.AsSpan(4, 4));
        if (forgedPrefixSeconds is { } forged)
        {
            BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(12, 4), 36);
            "mdat"u8.CopyTo(bytes.AsSpan(16, 4));
            WriteMvhd(bytes.AsSpan(20, 28), forged);
        }
        var moovOffset = 12 + prefixLength;
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(moovOffset, 4), 36);
        "moov"u8.CopyTo(bytes.AsSpan(moovOffset + 4, 4));
        WriteMvhd(bytes.AsSpan(moovOffset + 8, 28), seconds);
        return bytes;
    }

    private static void WriteMvhd(Span<byte> box, uint seconds)
    {
        BinaryPrimitives.WriteUInt32BigEndian(box, 28);
        "mvhd"u8.CopyTo(box[4..]);
        BinaryPrimitives.WriteUInt32BigEndian(box[20..], 1);
        BinaryPrimitives.WriteUInt32BigEndian(box[24..], seconds);
    }
}
