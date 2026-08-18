using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ZosyalMedya.Modules.Search.Application.Ports;
using ZosyalMedya.Modules.Search.Application.Search;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Search.Infrastructure.Persistence;

namespace ZosyalMedya.Modules.Search.Infrastructure;

public sealed class SearchOptions
{
    public const string SectionName = "Modules:Search";
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    public bool OpenSearchEnabled { get; init; }
}

public static class DependencyInjection
{
    public static IServiceCollection AddSearchModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<SearchOptions>().Bind(configuration.GetSection(SearchOptions.SectionName))
            .ValidateDataAnnotations().Validate(options => !options.OpenSearchEnabled,
                "OpenSearch adapter is an optional deployment profile and is not configured in this host.").ValidateOnStart();
        var options = configuration.GetSection(SearchOptions.SectionName).Get<SearchOptions>()
                      ?? throw new InvalidOperationException("Search configuration missing.");
        services.AddDbContext<SearchDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
        services.AddScoped<ISearchRepository, PostgreSqlSearchRepository>();
        services.AddScoped<ISearchModule, SearchModule>();
        services.AddScoped<SearchDiscoveryHandler>();
        services.AddHostedService<SearchInitializer>();
        return services;
    }
}

internal sealed class SearchInitializer(IServiceProvider provider) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<SearchDbContext>().Database.MigrateAsync(cancellationToken);
    }
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
