using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ZosyalMedya.Modules.Audit.Application.Audit;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Audit.Infrastructure.Persistence;

namespace ZosyalMedya.Modules.Audit.Infrastructure;

public sealed class AuditOptions
{
    public const string SectionName = "Modules:Audit";
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
}
public static class DependencyInjection
{
    public static IServiceCollection AddAuditModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<AuditOptions>().Bind(configuration.GetSection(AuditOptions.SectionName))
            .ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(AuditOptions.SectionName).Get<AuditOptions>()
                      ?? throw new InvalidOperationException("Audit configuration missing.");
        services.AddDbContext<AuditDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
        services.AddScoped<IAuditRepository, PostgreSqlAuditRepository>();
        services.AddScoped<IAuditModule, AuditModule>(); services.AddScoped<SearchAuditHandler>();
        services.AddHostedService<AuditInitializer>(); return services;
    }
}
internal sealed class AuditInitializer(IServiceProvider provider) : IHostedService
{
    public async Task StartAsync(CancellationToken token) { await using var scope = provider.CreateAsyncScope(); await scope.ServiceProvider.GetRequiredService<AuditDbContext>().Database.MigrateAsync(token); }
    public Task StopAsync(CancellationToken token) => Task.CompletedTask;
}
