using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using ZosyalMedya.Modules.Questions.Application.Ports;
using ZosyalMedya.Modules.Questions.Application.Questions;
using ZosyalMedya.Modules.Questions.Infrastructure.Configuration;
using ZosyalMedya.Modules.Questions.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Questions.Infrastructure;
public static class DependencyInjection
{
    public static IServiceCollection AddQuestionsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<QuestionsPersistenceOptions>().Bind(configuration.GetSection(QuestionsPersistenceOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(QuestionsPersistenceOptions.SectionName).Get<QuestionsPersistenceOptions>() ?? throw new InvalidOperationException("Questions persistence configuration is missing.");
        if (options.Provider == QuestionsPersistenceProvider.PostgreSql) { services.AddDbContext<QuestionsDbContext>((provider,builder) => builder.UseNpgsql(options.PostgreSqlConnectionString).AddInterceptors(provider.GetRequiredService<OutboxSaveChangesInterceptor>())); services.AddScoped<IQuestionRepository, PostgreSqlQuestionRepository>(); }
        else { services.AddSingleton(_ => new QuestionsMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName))); services.AddScoped(sp => new MongoQuestionRepository(sp.GetRequiredService<QuestionsMongoDatabase>().Database)); services.AddScoped<IQuestionRepository>(sp => sp.GetRequiredService<MongoQuestionRepository>()); }
        services.AddScoped<AskQuestionHandler>(); services.AddScoped<AnswerQuestionHandler>(); services.AddScoped<QuestionInboxHandler>(); services.AddScoped<GetQuestionHandler>(); services.AddScoped<ListProfileQuestionsHandler>(); services.AddScoped<ChangeQuestionStateHandler>(); services.AddScoped<PublishScheduledQuestionsHandler>(); services.AddHostedService<QuestionsPersistenceInitializer>(); services.AddHostedService<ScheduledQuestionPublisher>(); return services;
    }
}

internal sealed class ScheduledQuestionPublisher(IServiceProvider provider, ILogger<ScheduledQuestionPublisher> logger) : BackgroundService
{
    private static readonly Action<ILogger, Exception?> LogCycleFailed = LoggerMessage.Define(
        LogLevel.Error, new EventId(4301, "ScheduledQuestionCycleFailed"),
        "Scheduled question publishing cycle failed; the next cycle will retry");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = provider.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<PublishScheduledQuestionsHandler>()
                    .HandleAsync(100, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { LogCycleFailed(logger, exception); }
            try { if (!await timer.WaitForNextTickAsync(stoppingToken)) break; }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
internal sealed record QuestionsMongoDatabase(IMongoDatabase Database);
internal sealed class QuestionsPersistenceInitializer(IServiceProvider provider, IOptions<QuestionsPersistenceOptions> options) : IHostedService
{
    public async Task StartAsync(CancellationToken token) { await using var scope = provider.CreateAsyncScope(); if (options.Value.Provider == QuestionsPersistenceProvider.PostgreSql) await scope.ServiceProvider.GetRequiredService<QuestionsDbContext>().Database.MigrateAsync(token); else await scope.ServiceProvider.GetRequiredService<MongoQuestionRepository>().EnsureIndexesAsync(token); }
    public Task StopAsync(CancellationToken token) => Task.CompletedTask;
}
