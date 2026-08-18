using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Media.Application.Ports;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Media.Infrastructure.Persistence;
using ZosyalMedya.Modules.Media.Infrastructure.Processing;
using ZosyalMedya.Modules.Media.Infrastructure.Storage;

namespace ZosyalMedya.Modules.Media.Infrastructure;

public sealed class MediaOptions
{
    public const string SectionName = "Modules:Media";
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string FileSystemRoot { get; init; } = string.Empty;
    public ObjectStorageProvider ObjectStorageProvider { get; init; } = ObjectStorageProvider.FileSystem;
    public string MinioEndpoint { get; init; } = string.Empty;
    public string MinioAccessKey { get; init; } = string.Empty;
    public string MinioSecretKey { get; init; } = string.Empty;
    // Existing local MediaAsset rows and MinIO volumes use this compatibility
    // bucket. Public Compose overrides it with the locked public name.
    public string MinioBucket { get; init; } = "zosyalmedya-media";
    public bool MinioUseSsl { get; init; }
    public AntivirusProvider AntivirusProvider { get; init; } = AntivirusProvider.Local;
    public string ClamAvHost { get; init; } = "localhost";
    [Range(1, 65535)] public int ClamAvPort { get; init; } = 3310;
    [Range(1, 300)] public int ClamAvTimeoutSeconds { get; init; } = 30;
    [Range(1, 32)] public int ClamAvMaxConcurrentScans { get; init; } = 4;
    [Range(1, 1440)] public int CleanupIntervalMinutes { get; init; } = 30;
    [Range(1, 104_857_600)] public long MaxFileBytes { get; init; } = 100L * 1024 * 1024;
    [Range(1, 2_147_483_648)] public long OwnerQuotaBytes { get; init; } = 2L * 1024 * 1024 * 1024;
    [Range(1, 16)] public int MaxConcurrentProcessing { get; init; } = 4;
    [Range(1, 32)] public int MaxConcurrentIngestion { get; init; } = 8;
    [Range(1, 100_000_000)] public long MaxImagePixels { get; init; } = 50_000_000;
    [Range(1, 3600)] public int MaxVideoDurationSeconds { get; init; } = 600;
}

public enum ObjectStorageProvider { FileSystem, Minio }
public enum AntivirusProvider { Local, ClamAv }

public static class DependencyInjection
{
    public static IServiceCollection AddMediaModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<MediaOptions>().Bind(configuration.GetSection(MediaOptions.SectionName))
            .ValidateDataAnnotations()
            .Validate(value => value.ObjectStorageProvider != ObjectStorageProvider.Minio ||
                               !string.IsNullOrWhiteSpace(value.MinioEndpoint) &&
                               !string.IsNullOrWhiteSpace(value.MinioAccessKey) &&
                               !string.IsNullOrWhiteSpace(value.MinioSecretKey) &&
                               !string.IsNullOrWhiteSpace(value.MinioBucket),
                "MinIO provider requires endpoint, access key, secret key and bucket.")
            .Validate(value => value.AntivirusProvider != AntivirusProvider.ClamAv || !string.IsNullOrWhiteSpace(value.ClamAvHost),
                "ClamAV provider requires a host.")
            .ValidateOnStart();
        var options = configuration.GetSection(MediaOptions.SectionName).Get<MediaOptions>()
                      ?? throw new InvalidOperationException("Media configuration missing.");
        services.AddDbContext<MediaDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
        services.AddScoped<IMediaRepository, PostgreSqlMediaRepository>();
        if (options.ObjectStorageProvider == ObjectStorageProvider.Minio)
            services.AddSingleton<IObjectStorage, MinioObjectStorage>();
        else
            services.AddSingleton<IObjectStorage, FileSystemObjectStorage>();
        if (options.AntivirusProvider == AntivirusProvider.ClamAv)
            services.AddSingleton<IAntivirusScanner, ClamAvAntivirusScanner>();
        else
            services.AddSingleton<IAntivirusScanner, LocalAntivirusScanner>();
        services.AddSingleton(new MediaProcessingLimits(options.MaxImagePixels, options.MaxVideoDurationSeconds));
        services.AddSingleton<IMediaProcessor, SkiaMediaProcessor>();
        services.AddSingleton(new MediaProcessingGate(options.MaxConcurrentProcessing));
        services.AddSingleton(new MediaIngestionGate(options.MaxConcurrentIngestion));
        services.AddSingleton(new MediaLimits(options.MaxFileBytes, options.OwnerQuotaBytes));
        services.AddScoped<InitiateMediaHandler>();
        services.AddScoped<UploadMediaHandler>();
        services.AddScoped<DownloadMediaHandler>();
        services.AddScoped<DeleteMediaHandler>();
        services.AddScoped<IMediaModule, MediaModule>();
        services.AddHostedService<MediaInitializer>();
        services.AddHostedService<OrphanMediaCleanupService>();
        return services;
    }
}

internal sealed class MediaInitializer(IServiceProvider provider) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<MediaDbContext>().Database.MigrateAsync(cancellationToken);
    }
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class OrphanMediaCleanupService(IServiceProvider provider, Microsoft.Extensions.Options.IOptions<MediaOptions> options, TimeProvider timeProvider, Microsoft.Extensions.Logging.ILogger<OrphanMediaCleanupService> logger)
    : BackgroundService
{
    private static readonly Action<Microsoft.Extensions.Logging.ILogger, Exception?> LogCycleFailed = Microsoft.Extensions.Logging.LoggerMessage.Define(
        Microsoft.Extensions.Logging.LogLevel.Error, new Microsoft.Extensions.Logging.EventId(4304, "OrphanMediaCleanupCycleFailed"),
        "Orphan media cleanup cycle failed; the next cycle will retry");
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(options.Value.CleanupIntervalMinutes));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = provider.CreateAsyncScope();
                var repository = scope.ServiceProvider.GetRequiredService<IMediaRepository>();
                var storage = scope.ServiceProvider.GetRequiredService<IObjectStorage>();
                var expired = await repository.ListExpiredPendingAsync(timeProvider.GetUtcNow(), 100, stoppingToken);
                foreach (var asset in expired)
                {
                    if (asset.Status != Domain.Assets.MediaStatus.Deleted &&
                        !await repository.TryMarkExpiredDeletedAsync(asset.Id, asset.Version, timeProvider.GetUtcNow(), stoppingToken))
                        continue;
                    await storage.DeleteAsync(asset.StorageKey, stoppingToken);
                    foreach (var variant in asset.Variants) await storage.DeleteAsync(variant.StorageKey, stoppingToken);
                    await repository.DeleteByFilterAsync(x => x.Id == asset.Id && x.Status == Domain.Assets.MediaStatus.Deleted &&
                            x.PendingExpiresAtUtc < timeProvider.GetUtcNow(),
                        stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { LogCycleFailed(logger, exception); }
            try { if (!await timer.WaitForNextTickAsync(stoppingToken)) break; }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
