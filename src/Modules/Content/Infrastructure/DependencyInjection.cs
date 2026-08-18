using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Contracts;
using ZosyalMedya.Modules.Content.Infrastructure.Configuration;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.Modules.Content.Infrastructure.Publishing;
using ZosyalMedya.Modules.Content.Application.Polls;
using ZosyalMedya.Modules.Content.Application.Saved;
using ZosyalMedya.Modules.Content.Application.Impressions;

namespace ZosyalMedya.Modules.Content.Infrastructure;
public static class DependencyInjection
{
    public static IServiceCollection AddContentModule(this IServiceCollection services,IConfiguration configuration)
    {
        services.AddOptions<ContentPersistenceOptions>().Bind(configuration.GetSection(ContentPersistenceOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options=configuration.GetSection(ContentPersistenceOptions.SectionName).Get<ContentPersistenceOptions>()??throw new InvalidOperationException("Content persistence configuration is missing.");
        if(options.Provider==ContentPersistenceProvider.PostgreSql)
        {
            services.AddDbContext<ContentDbContext>((provider,builder)=>builder.UseNpgsql(options.PostgreSqlConnectionString).AddInterceptors(provider.GetRequiredService<OutboxSaveChangesInterceptor>()));
            services.AddScoped<IPostRepository,PostgreSqlPostRepository>();
            services.AddScoped<IPollRepository,PostgreSqlPollRepository>();
            services.AddScoped<ISavedContentRepository,PostgreSqlSavedContentRepository>();
            services.AddScoped<IPostImpressionRepository,PostgreSqlPostImpressionRepository>();
        }
        else
        {
            services.AddSingleton(_=>new ContentMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName)));
            services.AddScoped(provider=>new MongoPostRepository(provider.GetRequiredService<ContentMongoDatabase>().Database));
            services.AddScoped<IPostRepository>(provider=>provider.GetRequiredService<MongoPostRepository>());
            services.AddScoped(provider=>new MongoPollRepository(provider.GetRequiredService<ContentMongoDatabase>().Database));
            services.AddScoped<IPollRepository>(provider=>provider.GetRequiredService<MongoPollRepository>());
            services.AddScoped(provider=>new MongoSavedContentRepository(provider.GetRequiredService<ContentMongoDatabase>().Database));services.AddScoped<ISavedContentRepository>(provider=>provider.GetRequiredService<MongoSavedContentRepository>());
            services.AddScoped(provider=>new MongoPostImpressionRepository(provider.GetRequiredService<ContentMongoDatabase>().Database,provider.GetRequiredService<TimeProvider>()));services.AddScoped<IPostImpressionRepository>(provider=>provider.GetRequiredService<MongoPostImpressionRepository>());
        }
        services.AddScoped<CreatePostHandler>();services.AddScoped<UpdatePostHandler>();services.AddScoped<ChangePostHandler>();services.AddScoped<GetContentHandler>();services.AddScoped<PublishScheduledPostsHandler>();services.AddScoped<CreatePollHandler>();services.AddScoped<VotePollHandler>();services.AddScoped<GetPollHandler>();services.AddScoped<SaveContentHandler>();services.AddScoped<ListSavedContentHandler>();services.AddScoped<RecordImpressionHandler>();services.AddScoped<IContentModule,ContentModule>();services.AddHostedService<ContentPersistenceInitializer>();services.AddHostedService<ScheduledPostPublisher>();return services;
    }
}
internal sealed record ContentMongoDatabase(IMongoDatabase Database);
internal sealed class ContentPersistenceInitializer(IServiceProvider provider,IOptions<ContentPersistenceOptions>options):IHostedService
{
    public async Task StartAsync(CancellationToken token){await using var scope=provider.CreateAsyncScope();if(options.Value.Provider==ContentPersistenceProvider.PostgreSql)await scope.ServiceProvider.GetRequiredService<ContentDbContext>().Database.MigrateAsync(token);else{await scope.ServiceProvider.GetRequiredService<MongoPostRepository>().EnsureIndexesAsync(token);await scope.ServiceProvider.GetRequiredService<MongoPollRepository>().EnsureIndexesAsync(token);await scope.ServiceProvider.GetRequiredService<MongoSavedContentRepository>().EnsureIndexesAsync(token);await scope.ServiceProvider.GetRequiredService<MongoPostImpressionRepository>().EnsureIndexesAsync(token);}}
    public Task StopAsync(CancellationToken token)=>Task.CompletedTask;
}
