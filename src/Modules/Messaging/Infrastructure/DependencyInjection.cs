using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Messaging.Contracts;
using ZosyalMedya.Modules.Messaging.Infrastructure.Configuration;
using ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Messaging.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.Modules.Messaging.Infrastructure.Realtime;
using ZosyalMedya.Modules.Media.Contracts;

namespace ZosyalMedya.Modules.Messaging.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddMessagingModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<MessagingPersistenceOptions>().Bind(configuration.GetSection(MessagingPersistenceOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(MessagingPersistenceOptions.SectionName).Get<MessagingPersistenceOptions>() ?? throw new InvalidOperationException("Messaging persistence configuration is missing.");
        if (options.Provider == MessagingPersistenceProvider.PostgreSql)
        {
            services.AddDbContext<MessagingDbContext>((provider,builder) => builder.UseNpgsql(options.PostgreSqlConnectionString).AddInterceptors(provider.GetRequiredService<OutboxSaveChangesInterceptor>()));
            services.AddScoped<IConversationRepository, PostgreSqlConversationRepository>();
            services.AddScoped<IMessageRepository, PostgreSqlMessageRepository>();
        }
        else
        {
            services.AddSingleton(_ => new MessagingMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName)));
            services.AddScoped(sp => new MongoConversationRepository(sp.GetRequiredService<MessagingMongoDatabase>().Database));
            services.AddScoped(sp => new MongoMessageRepository(sp.GetRequiredService<MessagingMongoDatabase>().Database, sp.GetRequiredService<TimeProvider>()));
            services.AddScoped<IConversationRepository>(sp => sp.GetRequiredService<MongoConversationRepository>());
            services.AddScoped<IMessageRepository>(sp => sp.GetRequiredService<MongoMessageRepository>());
            services.AddHostedService<MongoMessageOutboxWorker>();
        }
        services.AddScoped<CreateConversationHandler>(); services.AddScoped<ListConversationsHandler>();
        services.AddScoped<SendMessageHandler>(); services.AddScoped<ListMessagesHandler>(); services.AddScoped<ChangeMessageHandler>();
        services.AddScoped<IMessagingModule, MessagingModule>(); services.TryAddSingleton<IRealtimeMessagePublisher, NullRealtimeMessagePublisher>();
        services.AddScoped<IMediaAccessGrantProvider, MessagingMediaAccessGrantProvider>();
        services.AddScoped<IIntegrationEventConsumer, MessageSentRealtimeConsumer>();
        services.AddHostedService<MessagingInitializer>(); return services;
    }
}

internal sealed record MessagingMongoDatabase(IMongoDatabase Database);
internal sealed class MessagingInitializer(IServiceProvider provider, IOptions<MessagingPersistenceOptions> options) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        if (options.Value.Provider == MessagingPersistenceProvider.PostgreSql)
            await scope.ServiceProvider.GetRequiredService<MessagingDbContext>().Database.MigrateAsync(cancellationToken);
        else
        {
            await scope.ServiceProvider.GetRequiredService<MongoConversationRepository>().EnsureIndexesAsync(cancellationToken);
            await scope.ServiceProvider.GetRequiredService<MongoMessageRepository>().EnsureIndexesAsync(cancellationToken);
        }
    }
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class NullRealtimeMessagePublisher : IRealtimeMessagePublisher
{
    public Task MessageSentAsync(MessageNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task ReceiptChangedAsync(Guid conversationId, Guid messageId, Guid userId, string state, DateTimeOffset atUtc, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task MessageChangedAsync(Guid conversationId, Guid messageId, Guid senderId, string text,
        IReadOnlyList<Guid> mediaIds, Guid? replyToId, string status, string deliveryState,
        DateTimeOffset createdAtUtc, DateTimeOffset updatedAtUtc, long version, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
