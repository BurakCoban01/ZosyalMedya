using System.Security.Cryptography;
using System.Text;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Content.Application.Ports;
using ZosyalMedya.Modules.Content.Contracts;

namespace ZosyalMedya.Modules.Content.Application.Impressions;

public sealed record ImpressionResult(bool Counted, long ViewCount);
public sealed class RecordImpressionHandler(IContentModule content, IPostImpressionRepository impressions, IClock clock)
{
    public async Task<Result<ImpressionResult>> HandleAsync(Guid postId, Guid? viewerId, string? anonymousSession,
        CancellationToken cancellationToken)
    {
        var visible = await content.GetVisibleAsync(postId, viewerId, cancellationToken);
        if (visible is null) return Result.Failure<ImpressionResult>("content.not_found", "İçerik bulunamadı veya görünür değil.");
        var identity = viewerId.HasValue ? $"user:{viewerId.Value:N}" : NormalizeAnonymous(anonymousSession);
        if (identity is null) return Result.Failure<ImpressionResult>("content.view_session_required", "Anonim görüntüleme için rastgele oturum kimliği gereklidir.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)));
        var counted = await impressions.RecordUniqueAsync(new(postId), hash, DateOnly.FromDateTime(clock.UtcNow.UtcDateTime), cancellationToken);
        var current = await content.GetVisibleAsync(postId, viewerId, cancellationToken);
        return Result.Success(new ImpressionResult(counted, current?.ViewCount ?? visible.ViewCount));
    }
    private static string? NormalizeAnonymous(string? value)
    { if (string.IsNullOrWhiteSpace(value)) return null; var clean = value.Trim(); return clean.Length is >= 16 and <= 128 && clean.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_') ? $"anon:{clean}" : null; }
}
