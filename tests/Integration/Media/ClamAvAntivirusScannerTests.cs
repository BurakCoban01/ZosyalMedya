using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Options;
using Xunit;
using ZosyalMedya.Modules.Media.Infrastructure;
using ZosyalMedya.Modules.Media.Infrastructure.Processing;

namespace ZosyalMedya.Tests.Integration.Media;

public sealed class ClamAvAntivirusScannerTests
{
    [Theory]
    [InlineData("stream: OK", true)]
    [InlineData("stream: Win.Test.EICAR_HDB-1 FOUND", false)]
    public async Task StreamsLengthPrefixedContentAndMapsClamdResponse(string response, bool expectedSafe)
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var received = new MemoryStream();
        var server = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            await using var network = client.GetStream();
            var command = new byte[10];
            await ReadExactlyAsync(network, command);
            Assert.Equal("zINSTREAM\0", Encoding.ASCII.GetString(command));
            var lengthBytes = new byte[4];
            while (true)
            {
                await ReadExactlyAsync(network, lengthBytes);
                var length = BinaryPrimitives.ReadInt32BigEndian(lengthBytes);
                if (length == 0) break;
                var chunk = new byte[length];
                await ReadExactlyAsync(network, chunk);
                await received.WriteAsync(chunk);
            }
            await network.WriteAsync(Encoding.UTF8.GetBytes(response + "\0"));
        });
        using var scanner = new ClamAvAntivirusScanner(Options.Create(new MediaOptions
        {
            PostgreSqlConnectionString = "unused",
            FileSystemRoot = "unused",
            AntivirusProvider = AntivirusProvider.ClamAv,
            ClamAvHost = IPAddress.Loopback.ToString(),
            ClamAvPort = port,
            ClamAvTimeoutSeconds = 5,
            ClamAvMaxConcurrentScans = 1
        }));

        var result = await scanner.ScanAsync(new MemoryStream("payload"u8.ToArray()));
        await server;

        Assert.Equal(expectedSafe, result.Safe);
        Assert.Equal("payload", Encoding.UTF8.GetString(received.ToArray()));
        Assert.Equal(expectedSafe, result.Reason is null);
    }

    private static async Task ReadExactlyAsync(Stream stream, Memory<byte> destination)
    {
        var offset = 0;
        while (offset < destination.Length)
        {
            var read = await stream.ReadAsync(destination[offset..]);
            if (read == 0) throw new EndOfStreamException();
            offset += read;
        }
    }
}
