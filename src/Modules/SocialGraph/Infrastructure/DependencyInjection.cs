using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.SocialGraph.Application.Ports;
using ZosyalMedya.Modules.SocialGraph.Application.Relationships;
using ZosyalMedya.Modules.SocialGraph.Contracts;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Configuration;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddSocialGraphModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<SocialGraphPersistenceOptions>().Bind(configuration.GetSection(SocialGraphPersistenceOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(SocialGraphPersistenceOptions.SectionName).Get<SocialGraphPersistenceOptions>()
            ?? throw new InvalidOperationException("SocialGraph persistence configuration is missing.");
        if (options.Provider == SocialGraphPersistenceProvider.PostgreSql)
        {
            services.AddDbContext<SocialGraphDbContext>((provider, builder) => builder
                .UseNpgsql(options.PostgreSqlConnectionString)
                .AddInterceptors(provider.GetRequiredService<OutboxSaveChangesInterceptor>()));
            services.AddScoped<IRelationshipRepository, PostgreSqlRelationshipRepository>();
        }
        else
        {
            services.AddSingleton(_ => new SocialGraphMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName)));
            services.AddScoped(sp => new MongoRelationshipRepository(sp.GetRequiredService<SocialGraphMongoDatabase>().Database));
            services.AddScoped<IRelationshipRepository>(sp => sp.GetRequiredService<MongoRelationshipRepository>());
            services.AddHostedService<MongoRelationshipOutboxWorker>();
        }
        services.AddScoped<FollowHandler>(); services.AddScoped<AcceptFollowHandler>(); services.AddScoped<RejectFollowHandler>();
        services.AddScoped<ChangeRelationshipHandler>(); services.AddScoped<GetRelationshipHandler>(); services.AddScoped<SocialGraphReadHandler>();
        services.AddScoped<ISocialGraphModule, SocialGraphModule>();
        services.AddHostedService<SocialGraphPersistenceInitializer>();
        return services;
    }
}

internal sealed record SocialGraphMongoDatabase(IMongoDatabase Database);

internal sealed class SocialGraphPersistenceInitializer(IServiceProvider provider, IOptions<SocialGraphPersistenceOptions> options) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        if (options.Value.Provider == SocialGraphPersistenceProvider.PostgreSql)
            await scope.ServiceProvider.GetRequiredService<SocialGraphDbContext>().Database.MigrateAsync(cancellationToken);
        else await scope.ServiceProvider.GetRequiredService<MongoRelationshipRepository>().EnsureIndexesAsync(cancellationToken);
    }
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
