using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using ZosyalMedya.BuildingBlocks.Application.Ports;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Redis;

public static class DependencyInjection
{
    public static IServiceCollection AddRedisInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<RedisOptions>()
            .Bind(configuration.GetSection(RedisOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
        var options = configuration.GetSection(RedisOptions.SectionName).Get<RedisOptions>()
            ?? throw new InvalidOperationException("Redis configuration is missing.");
        services.AddSingleton<IConnectionMultiplexer>(_ =>
        {
            var redisConfiguration = ConfigurationOptions.Parse(options.ConnectionString);
            redisConfiguration.AbortOnConnectFail = false;
            redisConfiguration.ConnectTimeout = options.ConnectTimeoutSeconds * 1000;
            redisConfiguration.ConnectRetry = 2;
            return ConnectionMultiplexer.Connect(redisConfiguration);
        });
        services.AddSingleton<RedisStorageAdapters>();
        services.AddSingleton<ICacheService>(sp => sp.GetRequiredService<RedisStorageAdapters>());
        services.AddSingleton<IIdempotencyStore>(sp => sp.GetRequiredService<RedisStorageAdapters>());
        services.AddSingleton<IRateLimitStore>(sp => sp.GetRequiredService<RedisStorageAdapters>());
        services.AddSingleton<IPresenceStore>(sp => sp.GetRequiredService<RedisStorageAdapters>());
        return services;
    }
}
