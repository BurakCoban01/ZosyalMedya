using System.Text;
using ZosyalMedya.Modules.Media.Application.Ports;

namespace ZosyalMedya.Modules.Media.Infrastructure.Processing;

public sealed class LocalAntivirusScanner : IAntivirusScanner
{
    private const string EicarMarker = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";

    public async Task<(bool Safe, string? Reason)> ScanAsync(Stream source, CancellationToken cancellationToken = default)
    {
        using var memory = new MemoryStream();
        await source.CopyToAsync(memory, cancellationToken);
        var text = Encoding.ASCII.GetString(memory.GetBuffer(), 0, checked((int)memory.Length));
        return text.Contains(EicarMarker, StringComparison.Ordinal)
            ? (false, "Yerel tarayıcı test zararlısı imzasını algıladı.")
            : (true, null);
    }
}
