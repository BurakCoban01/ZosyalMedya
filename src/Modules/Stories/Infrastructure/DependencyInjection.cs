using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.Modules.Media.Contracts;
using ZosyalMedya.Modules.Stories.Application.Ports;
using ZosyalMedya.Modules.Stories.Application.Stories;
using ZosyalMedya.Modules.Stories.Contracts;
using ZosyalMedya.Modules.Stories.Infrastructure.Configuration;
using ZosyalMedya.Modules.Stories.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql;

namespace ZosyalMedya.Modules.Stories.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddStoriesModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<StoriesPersistenceOptions>().Bind(configuration.GetSection(StoriesPersistenceOptions.SectionName))
            .ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(StoriesPersistenceOptions.SectionName).Get<StoriesPersistenceOptions>() ??
            throw new InvalidOperationException("Stories persistence configuration is missing.");
        if (options.Provider == StoriesPersistenceProvider.PostgreSql)
        {
            services.AddDbContext<StoriesDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
            services.AddScoped<IStoryRepository, PostgreSqlStoryRepository>();
        }
        else
        {
            services.AddSingleton(_ => new StoriesMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName)));
            services.AddScoped(sp => new MongoStoryRepository(sp.GetRequiredService<StoriesMongoDatabase>().Database));
            services.AddScoped<IStoryRepository>(sp => sp.GetRequiredService<MongoStoryRepository>());
        }
        services.AddScoped<StoryVisibility>(); services.AddScoped<CreateStoryHandler>(); services.AddScoped<GetStoryHandler>();
        services.AddScoped<ListStoriesHandler>(); services.AddScoped<DeleteStoryHandler>();
        services.AddScoped<IStoriesModule, StoriesModule>(); services.AddScoped<IMediaAccessGrantProvider, StoryMediaAccessGrantProvider>();
        services.AddHostedService<StoriesPersistenceInitializer>(); return services;
    }
}

public sealed class StoryMediaAccessGrantProvider(IStoriesModule stories) : IMediaAccessGrantProvider
{
    public Task<bool> CanViewAsync(Guid mediaId, Guid? viewerId, CancellationToken cancellationToken = default) =>
        stories.CanViewMediaAsync(mediaId, viewerId, cancellationToken);
}

internal sealed record StoriesMongoDatabase(IMongoDatabase Database);
internal sealed class StoriesPersistenceInitializer(IServiceProvider provider, IOptions<StoriesPersistenceOptions> options) : IHostedService
{
    public async Task StartAsync(CancellationToken token)
    {
        await using var scope = provider.CreateAsyncScope();
        if (options.Value.Provider == StoriesPersistenceProvider.PostgreSql)
            await scope.ServiceProvider.GetRequiredService<StoriesDbContext>().Database.MigrateAsync(token);
        else await scope.ServiceProvider.GetRequiredService<MongoStoryRepository>().EnsureIndexesAsync(token);
    }
    public Task StopAsync(CancellationToken token) => Task.CompletedTask;
}
