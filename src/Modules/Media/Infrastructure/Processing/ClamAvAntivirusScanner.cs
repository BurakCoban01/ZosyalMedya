using System.Buffers.Binary;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Options;
using ZosyalMedya.Modules.Media.Application.Ports;

namespace ZosyalMedya.Modules.Media.Infrastructure.Processing;

/// <summary>
/// Dosyayı clamd'ye yol paylaşmadan, uzunluk önekli INSTREAM parçalarıyla gönderir.
/// TCP bağlantısı yalnız güvenilen iç ağda kullanılmalıdır; clamd protokolü taşıma şifrelemesi sağlamaz.
/// </summary>
public sealed class ClamAvAntivirusScanner : IAntivirusScanner, IDisposable
{
    private const int ChunkSize = 64 * 1024;
    private readonly MediaOptions options;
    private readonly SemaphoreSlim scanSlots;

    public ClamAvAntivirusScanner(IOptions<MediaOptions> options)
    {
        this.options = options.Value;
        scanSlots = new SemaphoreSlim(this.options.ClamAvMaxConcurrentScans, this.options.ClamAvMaxConcurrentScans);
    }

    public async Task<(bool Safe, string? Reason)> ScanAsync(Stream source, CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(options.ClamAvTimeoutSeconds));
        await scanSlots.WaitAsync(timeout.Token);
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(options.ClamAvHost, options.ClamAvPort, timeout.Token);
            await using var network = client.GetStream();
            await network.WriteAsync("zINSTREAM\0"u8.ToArray(), timeout.Token);

            var buffer = new byte[ChunkSize];
            var lengthBuffer = new byte[sizeof(int)];
            int read;
            while ((read = await source.ReadAsync(buffer, timeout.Token)) > 0)
            {
                BinaryPrimitives.WriteInt32BigEndian(lengthBuffer, read);
                await network.WriteAsync(lengthBuffer, timeout.Token);
                await network.WriteAsync(buffer.AsMemory(0, read), timeout.Token);
            }
            BinaryPrimitives.WriteInt32BigEndian(lengthBuffer, 0);
            await network.WriteAsync(lengthBuffer, timeout.Token);
            await network.FlushAsync(timeout.Token);

            var response = await ReadResponseAsync(network, timeout.Token);
            if (response.EndsWith(" OK", StringComparison.Ordinal)) return (true, null);
            if (response.EndsWith(" FOUND", StringComparison.Ordinal))
                return (false, response[..^" FOUND".Length].Trim());
            throw new ClamAvProtocolException($"clamd beklenmeyen yanıt döndürdü: {response}");
        }
        finally
        {
            scanSlots.Release();
        }
    }

    private static async Task<string> ReadResponseAsync(Stream stream, CancellationToken token)
    {
        using var result = new MemoryStream();
        var buffer = new byte[256];
        while (result.Length <= 4096)
        {
            var read = await stream.ReadAsync(buffer, token);
            if (read == 0) break;
            var terminator = Array.IndexOf(buffer, (byte)0, 0, read);
            await result.WriteAsync(buffer.AsMemory(0, terminator >= 0 ? terminator : read), token);
            if (terminator >= 0) break;
        }
        if (result.Length == 0 || result.Length > 4096)
            throw new ClamAvProtocolException("clamd boş veya aşırı uzun yanıt döndürdü.");
        return Encoding.UTF8.GetString(result.ToArray()).Trim();
    }

    public void Dispose() => scanSlots.Dispose();
}

public sealed class ClamAvProtocolException(string message) : IOException(message);
