using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using ZosyalMedya.BuildingBlocks.Application.Ports;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Redis;

public sealed class RedisStorageAdapters(
    IConnectionMultiplexer connection,
    IOptions<RedisOptions> options,
    ILogger<RedisStorageAdapters> logger) : ICacheService, IIdempotencyStore, IRateLimitStore, IPresenceStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private static readonly Action<ILogger, string, string, Exception?> LogDegraded = LoggerMessage.Define<string, string>(
        LogLevel.Warning,
        new EventId(2101, "RedisDegraded"),
        "Redis {Operation} degraded for key category {Category}");
    private readonly IDatabase _database = connection.GetDatabase();
    private readonly string _prefix = $"{options.Value.Environment}:{options.Value.Application}:v1";

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var value = await _database.StringGetAsync(BuildKey("cache", key)).WaitAsync(cancellationToken);
            return value.IsNullOrEmpty ? default : JsonSerializer.Deserialize<T>(value.ToString(), SerializerOptions);
        }
        catch (RedisException exception)
        {
            LogDegraded(logger, "cache-read", KeyCategory(key), exception);
            return default;
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(value);
        try
        {
            var payload = JsonSerializer.Serialize(value, SerializerOptions);
            await _database.StringSetAsync(BuildKey("cache", key), payload, ttl ?? TimeSpan.FromMinutes(5)).WaitAsync(cancellationToken);
        }
        catch (RedisException exception)
        {
            LogDegraded(logger, "cache-write", KeyCategory(key), exception);
        }
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            await _database.KeyDeleteAsync(BuildKey("cache", key)).WaitAsync(cancellationToken);
        }
        catch (RedisException exception)
        {
            LogDegraded(logger, "cache-invalidation", KeyCategory(key), exception);
        }
    }

    public async Task<bool> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default) =>
        await _database.StringSetAsync(BuildKey("idempotency", key), "1", ttl, When.NotExists).WaitAsync(cancellationToken);

    public async Task<long> IncrementAsync(string key, TimeSpan window, CancellationToken cancellationToken = default)
    {
        var redisKey = BuildKey("rate", key);
        var count = await _database.StringIncrementAsync(redisKey).WaitAsync(cancellationToken);
        if (count == 1) await _database.KeyExpireAsync(redisKey, window).WaitAsync(cancellationToken);
        return count;
    }

    public async Task SetOnlineAsync(Guid userId, string connectionId, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        var key = BuildKey("presence", userId.ToString("N"));
        try
        {
            await _database.SetAddAsync(key, connectionId).WaitAsync(cancellationToken);
            await _database.KeyExpireAsync(key, ttl).WaitAsync(cancellationToken);
        }
        catch (RedisException exception) { LogDegraded(logger, "presence-online", "presence", exception); }
    }

    public async Task SetOfflineAsync(Guid userId, string connectionId, CancellationToken cancellationToken = default)
    {
        try { await _database.SetRemoveAsync(BuildKey("presence", userId.ToString("N")), connectionId).WaitAsync(cancellationToken); }
        catch (RedisException exception) { LogDegraded(logger, "presence-offline", "presence", exception); }
    }

    public async Task<bool> IsOnlineAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        try { return await _database.SetLengthAsync(BuildKey("presence", userId.ToString("N"))).WaitAsync(cancellationToken) > 0; }
        catch (RedisException exception) { LogDegraded(logger, "presence-read", "presence", exception); return false; }
    }

    private RedisKey BuildKey(string capability, string key) => $"{_prefix}:{capability}:{key}";
    private static string KeyCategory(string key) => key.Split(':', 2, StringSplitOptions.TrimEntries)[0];
}
