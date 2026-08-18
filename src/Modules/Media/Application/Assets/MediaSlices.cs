using System.Security.Cryptography;
using ZosyalMedya.BuildingBlocks.Application;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.SocialGraph.Contracts;

namespace ZosyalMedya.Modules.Media.Application.Assets;

public sealed record MediaView(Guid Id, string FileName, string ContentType, long Size, string Visibility,
    string Status, IReadOnlyDictionary<string, string> Urls, DateTimeOffset CreatedAtUtc, long Version);
public sealed record InitiatedMedia(MediaView Media, string UploadUrl, DateTimeOffset ExpiresAtUtc);

public sealed class InitiateMediaHandler(IMediaRepository media, MediaLimits limits, IClock clock)
{
    public async Task<Result<InitiatedMedia>> HandleAsync(Guid owner, string fileName, string contentType, long size,
        MediaVisibility visibility, CancellationToken token)
    {
        try
        {
            var id = MediaId.New();
            var item = MediaAsset.Initiate(id, new(owner), fileName, contentType, size, visibility,
                $"{owner:N}/{id.Value:N}/original", limits.MaxFileBytes, clock.UtcNow);
            if (!await media.TryCreateWithinQuotaAsync(item, limits.OwnerQuotaBytes, token))
                return Result.Failure<InitiatedMedia>("media.quota_exceeded", "Medya kotası aşıldı.");
            return Result.Success(new InitiatedMedia(Map(item), $"/api/v1/media/{id.Value:D}/content",
                item.PendingExpiresAtUtc!.Value));
        }
        catch (DomainRuleException exception)
        {
            return Result.Failure<InitiatedMedia>(exception.Code, exception.Message);
        }
    }

    internal static MediaView Map(MediaAsset item)
    {
        var urls = new Dictionary<string, string>();
        if (item.Status == MediaStatus.Ready)
        {
            urls["original"] = $"/api/v1/media/{item.Id.Value:D}/download";
            foreach (var variant in item.Variants)
                urls[variant.Name] = $"/api/v1/media/{item.Id.Value:D}/download?variant={Uri.EscapeDataString(variant.Name)}";
        }
        return new(item.Id.Value, item.OriginalFileName, item.ContentType, item.ActualSize, item.Visibility.ToString(),
            item.Status.ToString(), urls, item.CreatedAtUtc, item.Version);
    }
}

public sealed class UploadMediaHandler(IMediaRepository media, IObjectStorage storage, IAntivirusScanner antivirus,
    IMediaProcessor processor, MediaLimits limits, IClock clock, MediaProcessingGate? processingGate = null,
    MediaIngestionGate? ingestionGate = null)
{
    public async Task<Result<MediaView>> HandleAsync(Guid id, Guid owner, Stream content, CancellationToken token)
    {
        var item = await media.SelectAsync(x => x.Id == new MediaId(id), token);
        if (item is null) return Result.Failure<MediaView>("media.not_found", "Medya kaydı bulunamadı.");
        if (item.OwnerId != new MediaOwnerId(owner)) return Result.Failure<MediaView>("media.forbidden", "Medya başka kullanıcıya ait.");

        using var ingestionLease = ingestionGate is null ? null : await ingestionGate.AcquireAsync(token);
        await using var memory = new MemoryStream();
        var buffer = new byte[81_920];
        var remaining = item.ExpectedSize;
        while (remaining > 0)
        {
            var read = await content.ReadAsync(buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining)), token);
            if (read == 0) break;
            await memory.WriteAsync(buffer.AsMemory(0, read), token);
            remaining -= read;
        }
        var hasExcess = remaining == 0 && await content.ReadAsync(buffer.AsMemory(0, 1), token) != 0;
        if (remaining != 0 || hasExcess)
            return Result.Failure<MediaView>("media.size_mismatch", "Yüklenen boyut beyanla eşleşmiyor.");
        using var processingLease = await (processingGate ?? MediaProcessingGate.Unbounded).AcquireAsync(token);
        ingestionLease?.Dispose();
        var sha = Convert.ToHexString(SHA256.HashData(memory.GetBuffer().AsSpan(0, checked((int)memory.Length)))).ToLowerInvariant();
        var version = item.Version;
        try
        {
            item.BeginProcessing(new(owner), memory.Length, sha, clock.UtcNow);
        }
        catch (DomainRuleException exception)
        {
            return Result.Failure<MediaView>(exception.Code, exception.Message);
        }
        if (!await media.UpdateAsync(x => x.Id == item.Id, item, version, token))
            return Result.Failure<MediaView>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
        var processingVersion = item.Version;

        memory.Position = 0;
        var scan = await antivirus.ScanAsync(memory, token);
        if (!scan.Safe)
        {
            item.Quarantine(scan.Reason ?? "Zararlı içerik şüphesi", clock.UtcNow);
            if (!await media.UpdateAsync(x => x.Id == item.Id, item, processingVersion, token))
                return Result.Failure<MediaView>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
            return Result.Failure<MediaView>("media.quarantined", "Dosya karantinaya alındı.");
        }

        memory.Position = 0;
        ProcessedMedia processed;
        try
        {
            processed = await processor.ProcessAsync(memory, item.ContentType, token);
        }
        catch (InvalidDataException)
        {
            item.Quarantine("Dosya imzası veya içeriği türle eşleşmiyor.", clock.UtcNow);
            if (!await media.UpdateAsync(x => x.Id == item.Id, item, processingVersion, token))
                return Result.Failure<MediaView>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
            return Result.Failure<MediaView>("media.signature_invalid", "Dosya imzası geçersiz.");
        }

        var variants = processed.Variants.Select(variant =>
        {
            var key = $"{owner:N}/{item.Id.Value:N}/{variant.Name}";
            return MediaVariant.Create(variant.Name, key, variant.ContentType, variant.Bytes.LongLength,
                variant.Width, variant.Height);
        }).ToList();
        item.StageVariants(new(owner), variants, clock.UtcNow);
        if (!await media.UpdateAsync(x => x.Id == item.Id, item, processingVersion, token))
            return Result.Failure<MediaView>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
        var reservationVersion = item.Version;
        long storedBytes;
        try
        {
            storedBytes = checked(processed.SanitizedOriginal.LongLength +
                processed.Variants.Sum(variant => variant.Bytes.LongLength));
            item.ReserveProcessedStorage(new(owner), storedBytes, clock.UtcNow);
        }
        catch (OverflowException)
        {
            item.FailProcessing("İşlenmiş medya boyutu geçersiz.", clock.UtcNow);
            await media.UpdateAsync(x => x.Id == item.Id, item, reservationVersion, CancellationToken.None);
            return Result.Failure<MediaView>("media.size_invalid", "İşlenmiş medya boyutu geçersiz.");
        }
        if (!await media.TryUpdateStorageReservationWithinQuotaAsync(item, reservationVersion,
                limits.OwnerQuotaBytes, token))
        {
            item.FailProcessing("Medya kotası aşıldı.", clock.UtcNow);
            await media.UpdateAsync(x => x.Id == item.Id, item, reservationVersion, CancellationToken.None);
            return Result.Failure<MediaView>("media.quota_exceeded", "Medya kotası aşıldı.");
        }
        var storageVersion = item.Version;
        var intendedKeys = new List<string>();
        try
        {
            intendedKeys.Add(item.StorageKey);
            await storage.PutAsync(item.StorageKey, new MemoryStream(processed.SanitizedOriginal, false), token);
            for (var index = 0; index < processed.Variants.Count; index++)
            {
                var key = variants[index].StorageKey;
                intendedKeys.Add(key);
                await storage.PutAsync(key, new MemoryStream(processed.Variants[index].Bytes, false), token);
            }
            item.Complete(new(owner), variants, clock.UtcNow);
            if (!await media.UpdateAsync(x => x.Id == item.Id, item, storageVersion, token))
            {
                await DeleteWrittenAsync(storage, intendedKeys);
                return Result.Failure<MediaView>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
            }
        }
        catch
        {
            item.FailProcessing("Nesne depolama yazımı tamamlanamadı.", clock.UtcNow);
            try { await media.UpdateAsync(x => x.Id == item.Id, item, storageVersion, CancellationToken.None); }
            catch { /* Stale processing cleanup retains the persisted key plan and retries safely. */ }
            await DeleteWrittenAsync(storage, intendedKeys);
            throw;
        }
        return Result.Success(InitiateMediaHandler.Map(item));
    }

    private static async Task DeleteWrittenAsync(IObjectStorage storage, IEnumerable<string> keys)
    {
        foreach (var key in keys.Reverse())
        {
            try { await storage.DeleteAsync(key, CancellationToken.None); }
            catch { /* Every intended key is attempted; stale cleanup retries persisted variants. */ }
        }
    }
}

public sealed record MediaDownload(Stream Content, string ContentType, string FileName);

public sealed class DownloadMediaHandler(IMediaRepository media, IObjectStorage storage, ISocialGraphModule socialGraph,
    IEnumerable<IMediaAccessGrantProvider> accessGrantProviders)
{
    public async Task<Result<MediaDownload>> HandleAsync(Guid id, Guid? viewer, string? variant, CancellationToken token)
    {
        var item = await media.SelectAsync(x => x.Id == new MediaId(id), token);
        if (item is null || item.Status != MediaStatus.Ready)
            return Result.Failure<MediaDownload>("media.not_found", "Medya bulunamadı.");
        if (viewer.HasValue && viewer.Value != item.OwnerId.Value)
        {
            var relationship = await socialGraph.GetAsync(viewer.Value, item.OwnerId.Value, token);
            if (relationship.IsBlocked || relationship.IsBlockedByTarget)
                return Result.Failure<MediaDownload>("media.forbidden", "Bu medyaya erişim izniniz yok.");
        }
        var ordinarilyVisible = await MediaAuthorization.CanViewAsync(item, viewer, socialGraph, token);
        var granted = !ordinarilyVisible && item.Visibility == MediaVisibility.Private &&
                      await HasAccessGrantAsync(item.Id.Value, viewer, token);
        if (!ordinarilyVisible && !granted)
            return Result.Failure<MediaDownload>("media.forbidden", "Bu medyaya erişim izniniz yok.");
        var selected = string.IsNullOrWhiteSpace(variant) ? null : item.Variants.SingleOrDefault(x => x.Name == variant);
        if (variant is not null && selected is null)
            return Result.Failure<MediaDownload>("media.variant_not_found", "Varyant bulunamadı.");
        return Result.Success(new MediaDownload(await storage.OpenReadAsync(selected?.StorageKey ?? item.StorageKey, token),
            selected?.ContentType ?? item.ContentType, item.OriginalFileName));
    }

    private async Task<bool> HasAccessGrantAsync(Guid mediaId, Guid? viewerId, CancellationToken token)
    {
        foreach (var provider in accessGrantProviders)
            if (await provider.CanViewAsync(mediaId, viewerId, token)) return true;
        return false;
    }
}

public sealed class DeleteMediaHandler(IMediaRepository media, IObjectStorage storage, IClock clock)
{
    public async Task<Result<bool>> HandleAsync(Guid id, Guid owner, CancellationToken token)
    {
        var item = await media.SelectAsync(x => x.Id == new MediaId(id), token);
        if (item is null) return Result.Failure<bool>("media.not_found", "Medya bulunamadı.");
        if (item.OwnerId != new MediaOwnerId(owner))
            return Result.Failure<bool>("media.forbidden", "Bu medya üzerinde yetkin yok.");
        if (item.Status == MediaStatus.Deleted)
        {
            await storage.DeleteAsync(item.StorageKey, token);
            foreach (var variant in item.Variants) await storage.DeleteAsync(variant.StorageKey, token);
            return Result.Success(true);
        }
        var expected = item.Version;
        try { item.Delete(new(owner), clock.UtcNow); }
        catch (DomainRuleException exception) { return Result.Failure<bool>(exception.Code, exception.Message); }
        if (!await media.UpdateAsync(x => x.Id == item.Id, item, expected, token))
            return Result.Failure<bool>("media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
        await storage.DeleteAsync(item.StorageKey, token);
        foreach (var variant in item.Variants) await storage.DeleteAsync(variant.StorageKey, token);
        return Result.Success(true);
    }
}

public sealed class MediaModule(IMediaRepository media, ISocialGraphModule socialGraph, IClock clock) : IMediaModule
{
    public async Task<MediaAccess?> GetAuthorizedAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default)
    {
        var item = await media.SelectAsync(x => x.Id == new MediaId(mediaId), cancellationToken);
        if (item is null || item.Status != MediaStatus.Ready ||
            !await MediaAuthorization.CanViewAsync(item, viewerId, socialGraph, cancellationToken)) return null;
        return Map(item);
    }

    public async Task<MediaStoryClaim> ClaimForStoryAsync(Guid mediaId, Guid ownerId, Guid storyId,
        DateTimeOffset expiresAtUtc, CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var item = await media.SelectAsync(x => x.Id == new MediaId(mediaId), cancellationToken);
            if (item is null) return new(null, "media.not_found", "Medya bulunamadı.");
            var expected = item.Version;
            try { item.ClaimForStory(new(ownerId), storyId, expiresAtUtc, clock.UtcNow); }
            catch (DomainRuleException exception) { return new(null, exception.Code, exception.Message); }
            if (item.Version == expected || await media.UpdateAsync(x => x.Id == item.Id, item, expected, cancellationToken))
                return new(Map(item));
        }
        return new(null, "media.concurrency_conflict", "Medya eşzamanlı güncellendi.");
    }

    public async Task<bool> ReleaseStoryClaimAsync(Guid mediaId, Guid ownerId, Guid storyId,
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var item = await media.SelectAsync(x => x.Id == new MediaId(mediaId), cancellationToken);
            if (item is null) return true;
            var expected = item.Version;
            try { item.ReleaseStoryClaim(new(ownerId), storyId, clock.UtcNow); }
            catch (DomainRuleException) { return false; }
            if (item.Version == expected || await media.UpdateAsync(x => x.Id == item.Id, item, expected, cancellationToken))
                return true;
        }
        return false;
    }

    private static MediaAccess Map(MediaAsset item) => new(item.Id.Value, item.OwnerId.Value, item.ContentType,
        item.ActualSize, item.Visibility.ToString(), item.Status.ToString(), $"/api/v1/media/{item.Id.Value:D}/download");
}

internal static class MediaAuthorization
{
    public static async Task<bool> CanViewAsync(MediaAsset item, Guid? viewerId, ISocialGraphModule socialGraph,
        CancellationToken cancellationToken)
    {
        if (viewerId == item.OwnerId.Value) return true;
        if (viewerId is null) return item.Visibility == MediaVisibility.Public;
        var relationship = await socialGraph.GetAsync(viewerId.Value, item.OwnerId.Value, cancellationToken);
        if (relationship.IsBlocked || relationship.IsBlockedByTarget) return false;
        return item.Visibility == MediaVisibility.Public ||
               item.Visibility == MediaVisibility.Followers && relationship.IsFollowing;
    }
}
