using System.Net;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Infrastructure.Configuration;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Security;

// Yerel geliştirme adaptörü e-postayı kaynak ağacı dışındaki pickup klasörüne bırakır.
// Belirteç loglanmaz ve API yanıtına eklenmez; gerçek SMTP/push adaptörü aynı portu uygular.
public sealed class LocalIdentityMessageSender(IOptions<IdentityDeliveryOptions> options, IHostEnvironment environment, TimeProvider timeProvider) : IIdentityMessageSender
{
    public Task SendEmailVerificationAsync(string email, string rawToken, CancellationToken cancellationToken = default) =>
        WriteAsync(email, "E-posta adresinizi doğrulayın", "/auth/verify-email?token=", rawToken, cancellationToken);

    public Task SendPasswordResetAsync(string email, string rawToken, CancellationToken cancellationToken = default) =>
        WriteAsync(email, "Parolanızı yenileyin", "/auth/reset-password?token=", rawToken, cancellationToken);

    private async Task WriteAsync(string email, string subject, string path, string token, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, settings.LocalPickupDirectory));
        Directory.CreateDirectory(root);
        var id = $"{timeProvider.GetUtcNow():yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.eml";
        var target = Path.GetFullPath(Path.Combine(root, id));
        if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("E-posta pickup yolu izin verilen kökün dışına çıktı.");
        var link = settings.PublicWebBaseUrl.TrimEnd('/') + path + Uri.EscapeDataString(token);
        var body = $"To: {WebUtility.HtmlEncode(email)}\nSubject: {subject}\nContent-Type: text/plain; charset=utf-8\n\n{subject}: {link}\n";
        await File.WriteAllTextAsync(target, body, cancellationToken);
    }
}
