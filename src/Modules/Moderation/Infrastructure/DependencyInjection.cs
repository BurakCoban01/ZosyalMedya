using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ZosyalMedya.Modules.Moderation.Application.Cases;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Infrastructure.Persistence;

namespace ZosyalMedya.Modules.Moderation.Infrastructure;
public sealed class ModerationOptions { public const string SectionName = "Modules:Moderation"; [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty; }
public static class DependencyInjection
{
    public static IServiceCollection AddModerationModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ModerationOptions>().Bind(configuration.GetSection(ModerationOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(ModerationOptions.SectionName).Get<ModerationOptions>() ?? throw new InvalidOperationException("Moderation configuration missing.");
        services.AddDbContext<ModerationDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
        services.AddScoped<IModerationRepository, PostgreSqlModerationRepository>(); services.AddScoped<IModerationModule, ModerationModule>();
        services.AddScoped<CreateReportHandler>(); services.AddScoped<TriageReportHandler>(); services.AddScoped<ChangeModerationCaseHandler>();
        services.AddScoped<AppealModerationCaseHandler>(); services.AddScoped<ListModerationCasesHandler>();
        services.AddHostedService<ModerationInitializer>(); return services;
    }
}
internal sealed class ModerationInitializer(IServiceProvider provider) : IHostedService
{ public async Task StartAsync(CancellationToken token) { await using var scope = provider.CreateAsyncScope(); await scope.ServiceProvider.GetRequiredService<ModerationDbContext>().Database.MigrateAsync(token); } public Task StopAsync(CancellationToken token) => Task.CompletedTask; }
