using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using ZosyalMedya.Modules.Media.Application.Ports;

namespace ZosyalMedya.Modules.Media.Infrastructure.Storage;

/// <summary>
/// S3 uyumlu nesne depolamayı MinIO SDK üzerinden uygular; SDK tipleri application portuna çıkmaz.
/// Bucket kurulumu idempotent ve ilk kullanımdan önce tamamlanır.
/// </summary>
public sealed class MinioObjectStorage : IObjectStorage, IDisposable
{
    private readonly IMinioClient client;
    private readonly string bucket;
    private readonly SemaphoreSlim initializationLock = new(1, 1);
    private volatile bool initialized;

    public MinioObjectStorage(IOptions<MediaOptions> options)
    {
        var settings = options.Value;
        bucket = settings.MinioBucket;
        client = new MinioClient()
            .WithEndpoint(settings.MinioEndpoint)
            .WithCredentials(settings.MinioAccessKey, settings.MinioSecretKey)
            .WithSSL(settings.MinioUseSsl)
            .Build();
    }

    public async Task PutAsync(string key, Stream content, CancellationToken cancellationToken = default)
    {
        ValidateKey(key);
        await EnsureBucketAsync(cancellationToken);
        Stream upload = content;
        MemoryStream? ownedBuffer = null;
        if (!content.CanSeek)
        {
            ownedBuffer = new MemoryStream();
            await content.CopyToAsync(ownedBuffer, cancellationToken);
            ownedBuffer.Position = 0;
            upload = ownedBuffer;
        }

        try
        {
            var remaining = upload.Length - upload.Position;
            await client.PutObjectAsync(new PutObjectArgs().WithBucket(bucket).WithObject(key)
                .WithStreamData(upload).WithObjectSize(remaining), cancellationToken);
        }
        finally { if (ownedBuffer is not null) await ownedBuffer.DisposeAsync(); }
    }

    public async Task<Stream> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        ValidateKey(key);
        await EnsureBucketAsync(cancellationToken);
        var buffer = new MemoryStream();
        try
        {
            await client.GetObjectAsync(new GetObjectArgs().WithBucket(bucket).WithObject(key)
                .WithCallbackStream(async (source, token) => await source.CopyToAsync(buffer, token)), cancellationToken);
            buffer.Position = 0;
            return buffer;
        }
        catch { await buffer.DisposeAsync(); throw; }
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        ValidateKey(key);
        await EnsureBucketAsync(cancellationToken);
        await client.RemoveObjectAsync(new RemoveObjectArgs().WithBucket(bucket).WithObject(key), cancellationToken);
    }

    public async Task<string> CreateReadUrlAsync(string key, TimeSpan lifetime, CancellationToken cancellationToken = default)
    {
        ValidateKey(key);
        cancellationToken.ThrowIfCancellationRequested();
        await EnsureBucketAsync(cancellationToken);
        var seconds = (int)Math.Clamp(lifetime.TotalSeconds, 1, 604800);
        return await client.PresignedGetObjectAsync(new PresignedGetObjectArgs().WithBucket(bucket)
            .WithObject(key).WithExpiry(seconds));
    }

    private async Task EnsureBucketAsync(CancellationToken cancellationToken)
    {
        if (initialized) return;
        await initializationLock.WaitAsync(cancellationToken);
        try
        {
            if (initialized) return;
            var exists = await client.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket), cancellationToken);
            if (!exists) await client.MakeBucketAsync(new MakeBucketArgs().WithBucket(bucket), cancellationToken);
            initialized = true;
        }
        finally { initializationLock.Release(); }
    }

    private static void ValidateKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.StartsWith('/') ||
            key.Contains("..", StringComparison.Ordinal) || key.Contains('\\'))
            throw new ArgumentException("Geçersiz nesne depolama anahtarı.", nameof(key));
    }

    public void Dispose()
    {
        initializationLock.Dispose();
        if (client is IDisposable disposable) disposable.Dispose();
    }
}
