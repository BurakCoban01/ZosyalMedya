using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using ZosyalMedya.BuildingBlocks.Infrastructure.Redis;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Redis;

public sealed class RedisStorageAdaptersTests
{
    [Fact]
    public async Task CacheIdempotencyAndRateLimitUseAsyncStorageNeutralSemantics()
    {
        if (!InfrastructureTestGate.IsEnabled) return;
        await using var connection = await ConnectionMultiplexer.ConnectAsync("localhost:56379");
        var adapter = new RedisStorageAdapters(
            connection,
            Options.Create(new RedisOptions { ConnectionString = "localhost:56379", Environment = "test", Application = "zosyalmedya" }),
            NullLogger<RedisStorageAdapters>.Instance);
        var suffix = Guid.NewGuid().ToString("N");

        await adapter.SetAsync($"contract:{suffix}", new Payload("deger"), TimeSpan.FromMinutes(1));
        Assert.Equal("deger", (await adapter.GetAsync<Payload>($"contract:{suffix}"))?.Value);
        await adapter.RemoveAsync($"contract:{suffix}");
        Assert.Null(await adapter.GetAsync<Payload>($"contract:{suffix}"));

        Assert.True(await adapter.TryAcquireAsync($"command:{suffix}", TimeSpan.FromMinutes(1)));
        Assert.False(await adapter.TryAcquireAsync($"command:{suffix}", TimeSpan.FromMinutes(1)));
        Assert.Equal(1, await adapter.IncrementAsync($"actor:{suffix}", TimeSpan.FromMinutes(1)));
        Assert.Equal(2, await adapter.IncrementAsync($"actor:{suffix}", TimeSpan.FromMinutes(1)));
    }

    private sealed record Payload(string Value);
}
