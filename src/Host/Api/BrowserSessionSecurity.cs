using System.Security.Cryptography;
using System.Text;

namespace ZosyalMedya.Host.Api;

public sealed class BrowserSessionSecurity(bool development, IReadOnlyCollection<string> allowedOrigins)
{
    public const string CsrfHeaderName = "X-CSRF-Token";
    public string RefreshCookieName => development ? "escp-browser-refresh" : "__Host-escp-browser-refresh";
    public string CsrfCookieName => development ? "escp-browser-csrf" : "__Host-escp-browser-csrf";
    public string DemoMailboxCookieName => development ? "escp-demo-mailbox" : "__Host-escp-demo-mailbox";

    public bool IsSameOriginRequest(HttpRequest request)
    {
        var origin = request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(origin) ||
            !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return false;
        var fetchSite = request.Headers["Sec-Fetch-Site"].FirstOrDefault();
        return string.IsNullOrWhiteSpace(fetchSite) ||
            string.Equals(fetchSite, "same-origin", StringComparison.OrdinalIgnoreCase);
    }

    public bool HasValidCsrf(HttpRequest request)
    {
        if (!request.Cookies.TryGetValue(CsrfCookieName, out var cookie) || string.IsNullOrWhiteSpace(cookie)) return false;
        var header = request.Headers[CsrfHeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(header)) return false;
        var left = Encoding.UTF8.GetBytes(cookie);
        var right = Encoding.UTF8.GetBytes(header);
        return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
    }

    public void Issue(HttpResponse response, string refreshToken)
    {
        var csrf = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        response.Cookies.Append(RefreshCookieName, refreshToken, Options(httpOnly: true));
        response.Cookies.Append(CsrfCookieName, csrf, Options(httpOnly: false));
    }

    public void IssueDemoMailbox(HttpResponse response, string capability) =>
        response.Cookies.Append(DemoMailboxCookieName, capability, Options(httpOnly: true, maxAge: TimeSpan.FromHours(24)));

    public static void PreventCaching(HttpResponse response)
    {
        response.Headers.CacheControl = "no-store";
        response.Headers.Pragma = "no-cache";
    }

    public void Clear(HttpResponse response)
    {
        response.Cookies.Delete(RefreshCookieName, Options(httpOnly: true));
        response.Cookies.Delete(CsrfCookieName, Options(httpOnly: false));
    }

    private CookieOptions Options(bool httpOnly, TimeSpan? maxAge = null) => new()
    {
        HttpOnly = httpOnly,
        Secure = !development,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        MaxAge = maxAge ?? TimeSpan.FromDays(30),
        IsEssential = true
    };
}
