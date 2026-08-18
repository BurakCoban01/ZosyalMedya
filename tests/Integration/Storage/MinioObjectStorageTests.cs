using System.Text;
using Microsoft.Extensions.Options;
using ZosyalMedya.Modules.Media.Infrastructure;
using ZosyalMedya.Modules.Media.Infrastructure.Storage;
using Xunit;

namespace ZosyalMedya.Tests.Integration.Storage;

public sealed class MinioObjectStorageTests
{
    [Fact]
    public async Task PutReadSignAndDeleteRoundTrip()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("RUN_OBJECT_STORAGE_TESTS"), "true",
                StringComparison.OrdinalIgnoreCase)) return;
        var options = Options.Create(new MediaOptions
        {
            PostgreSqlConnectionString = "not-used",
            FileSystemRoot = "not-used",
            ObjectStorageProvider = ObjectStorageProvider.Minio,
            MinioEndpoint = "localhost:59000",
            MinioAccessKey = "local_minio",
            MinioSecretKey = "local_minio_change_me",
            MinioBucket = "zosyalmedya-contract-tests"
        });
        using var storage = new MinioObjectStorage(options);
        var key = $"contract/{Guid.NewGuid():N}.txt";
        var payload = Encoding.UTF8.GetBytes("depolama-sözleşmesi");

        await storage.PutAsync(key, new MemoryStream(payload));
        await using var stream = await storage.OpenReadAsync(key);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        Assert.Equal("depolama-sözleşmesi", await reader.ReadToEndAsync());
        var url = await storage.CreateReadUrlAsync(key, TimeSpan.FromMinutes(2));
        Assert.Contains("X-Amz-Signature", url, StringComparison.OrdinalIgnoreCase);
        await storage.DeleteAsync(key);
    }
}
