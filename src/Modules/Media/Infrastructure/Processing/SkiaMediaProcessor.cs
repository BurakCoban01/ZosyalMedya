using System.Buffers.Binary;
using SkiaSharp;
using ZosyalMedya.Modules.Media.Application.Ports;

namespace ZosyalMedya.Modules.Media.Infrastructure.Processing;

public sealed class SkiaMediaProcessor(MediaProcessingLimits? configuredLimits = null) : IMediaProcessor
{
    private readonly MediaProcessingLimits limits = configuredLimits ?? new(50_000_000, 600);
    public async Task<ProcessedMedia> ProcessAsync(Stream source, string contentType,
        CancellationToken cancellationToken = default)
    {
        using var memory = new MemoryStream();
        await source.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        if (contentType == "video/mp4")
        {
            if (bytes.Length < 12 || bytes[4] != (byte)'f' || bytes[5] != (byte)'t' ||
                bytes[6] != (byte)'y' || bytes[7] != (byte)'p') throw new InvalidDataException("MP4 imzası geçersiz.");
            var duration = ReadMp4Duration(bytes);
            if (duration > limits.MaxVideoDurationSeconds)
                throw new InvalidDataException("Video süresi güvenli sınırı aşıyor.");
            return new(bytes, contentType, []);
        }

        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data) ?? throw new InvalidDataException("Görüntü kod çözülemedi.");
        var expected = contentType switch
        {
            "image/jpeg" => SKEncodedImageFormat.Jpeg,
            "image/png" => SKEncodedImageFormat.Png,
            "image/webp" => SKEncodedImageFormat.Webp,
            _ => throw new InvalidDataException("Görüntü türü desteklenmiyor.")
        };
        if (codec.EncodedFormat != expected) throw new InvalidDataException("Görüntü imzası içerik türüyle eşleşmiyor.");
        if (codec.Info.Width < 1 || codec.Info.Height < 1 ||
            (long)codec.Info.Width * codec.Info.Height > limits.MaxImagePixels)
            throw new InvalidDataException("Görüntü boyutları güvenli sınırda değil.");
        using var bitmap = SKBitmap.Decode(bytes) ?? throw new InvalidDataException("Görüntü kod çözülemedi.");

        var sanitized = Encode(bitmap, expected, expected == SKEncodedImageFormat.Png ? 100 : 90);
        var variants = new List<ProcessedVariant>();
        foreach (var target in new[] { 320, 960 })
        {
            var scale = Math.Min(1d, target / (double)Math.Max(bitmap.Width, bitmap.Height));
            var width = Math.Max(1, (int)Math.Round(bitmap.Width * scale));
            var height = Math.Max(1, (int)Math.Round(bitmap.Height * scale));
            using var resized = new SKBitmap(width, height, bitmap.ColorType, bitmap.AlphaType);
            if (!bitmap.ScalePixels(resized, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)))
                throw new InvalidDataException("Görüntü türevi üretilemedi.");
            var variantBytes = Encode(resized, SKEncodedImageFormat.Webp, 82);
            variants.Add(new($"w{target}.webp", "image/webp", variantBytes, width, height));
        }
        return new(sanitized, contentType, variants);
    }

    private static byte[] Encode(SKBitmap bitmap, SKEncodedImageFormat format, int quality)
    {
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(format, quality) ?? throw new InvalidDataException("Görüntü kodlanamadı.");
        return encoded.ToArray();
    }

    private static double ReadMp4Duration(ReadOnlySpan<byte> bytes)
    {
        for (var offset = 0; TryReadBox(bytes, offset, out var type, out var payload, out var next); offset = next)
        {
            if (!type.SequenceEqual("moov"u8)) continue;
            var moov = bytes[payload..next];
            for (var childOffset = 0;
                 TryReadBox(moov, childOffset, out var childType, out var childPayload, out var childNext);
                 childOffset = childNext)
            {
                if (!childType.SequenceEqual("mvhd"u8)) continue;
                var body = moov[childPayload..childNext];
                if (body.Length < 20) break;
                var timescaleOffset = body[0] switch { 0 => 12, 1 => 20, _ => -1 };
                var durationOffset = body[0] switch { 0 => 16, 1 => 24, _ => -1 };
                var durationLength = body[0] == 0 ? 4 : 8;
                if (timescaleOffset < 0 || durationOffset + durationLength > body.Length) break;
                var timescale = BinaryPrimitives.ReadUInt32BigEndian(body.Slice(timescaleOffset, 4));
                if (timescale == 0) throw new InvalidDataException("MP4 zaman ölçeği geçersiz.");
                var duration = durationLength == 4
                    ? BinaryPrimitives.ReadUInt32BigEndian(body.Slice(durationOffset, 4))
                    : BinaryPrimitives.ReadUInt64BigEndian(body.Slice(durationOffset, 8));
                return duration / (double)timescale;
            }
        }
        throw new InvalidDataException("MP4 süre bilgisi bulunamadı.");
    }

    private static bool TryReadBox(ReadOnlySpan<byte> bytes, int offset, out ReadOnlySpan<byte> type,
        out int payloadOffset, out int nextOffset)
    {
        type = default;
        payloadOffset = nextOffset = bytes.Length;
        if (offset < 0 || bytes.Length - offset < 8) return false;
        var size32 = BinaryPrimitives.ReadUInt32BigEndian(bytes.Slice(offset, 4));
        var headerSize = 8;
        ulong size = size32;
        if (size32 == 1)
        {
            if (bytes.Length - offset < 16) return false;
            size = BinaryPrimitives.ReadUInt64BigEndian(bytes.Slice(offset + 8, 8));
            headerSize = 16;
        }
        else if (size32 == 0)
        {
            size = (ulong)(bytes.Length - offset);
        }
        if (size < (ulong)headerSize || size > int.MaxValue || size > (ulong)(bytes.Length - offset)) return false;
        type = bytes.Slice(offset + 4, 4);
        payloadOffset = offset + headerSize;
        nextOffset = offset + (int)size;
        return nextOffset > offset;
    }
}
