namespace ZosyalMedya.BuildingBlocks.Application.Ports;

public interface ICacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default);
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default);
    Task RemoveAsync(string key, CancellationToken cancellationToken = default);
}

public interface IIdempotencyStore
{
    Task<bool> TryAcquireAsync(string key, TimeSpan ttl, CancellationToken cancellationToken = default);
}

public interface IRateLimitStore
{
    Task<long> IncrementAsync(string key, TimeSpan window, CancellationToken cancellationToken = default);
}

public interface IPresenceStore
{
    Task SetOnlineAsync(Guid userId, string connectionId, TimeSpan ttl, CancellationToken cancellationToken = default);
    Task SetOfflineAsync(Guid userId, string connectionId, CancellationToken cancellationToken = default);
    Task<bool> IsOnlineAsync(Guid userId, CancellationToken cancellationToken = default);
}
