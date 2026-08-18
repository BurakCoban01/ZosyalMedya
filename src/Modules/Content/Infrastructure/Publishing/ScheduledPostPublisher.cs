using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ZosyalMedya.Modules.Content.Application.Posts;

namespace ZosyalMedya.Modules.Content.Infrastructure.Publishing;

public sealed class ScheduledPostPublisher(IServiceProvider provider, TimeProvider timeProvider, ILogger<ScheduledPostPublisher> logger) : BackgroundService
{
    private static readonly Action<ILogger, Exception?> LogCycleFailed = LoggerMessage.Define(
        LogLevel.Error, new EventId(4302, "ScheduledPostCycleFailed"),
        "Scheduled post publishing cycle failed; the next cycle will retry");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10), timeProvider);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = provider.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<PublishScheduledPostsHandler>().HandleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { LogCycleFailed(logger, exception); }
            try { if (!await timer.WaitForNextTickAsync(stoppingToken)) break; }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
