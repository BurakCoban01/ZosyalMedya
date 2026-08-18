using Xunit;

namespace ZosyalMedya.Tests.Contract;

public sealed class PublicEdgeContractTests
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));

    [Fact]
    public void NginxOwnsOneHostAndRequiredSameOriginRoutes()
    {
        var nginx = Read("apps/web-angular/nginx.conf");
        Assert.Contains("listen 8080 default_server", nginx, StringComparison.Ordinal);
        Assert.Contains("server_name ${PUBLIC_HOST}", nginx, StringComparison.Ordinal);
        Assert.Contains("location /api/", nginx, StringComparison.Ordinal);
        Assert.Contains("location /hubs/", nginx, StringComparison.Ordinal);
        Assert.Contains("location /health", nginx, StringComparison.Ordinal);
        Assert.Contains("location / { try_files $uri $uri/ /index.html; }", nginx, StringComparison.Ordinal);
        Assert.Contains("proxy_set_header Upgrade $http_upgrade", nginx, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicDocumentHeadersAreDeliberateAndInherited()
    {
        var nginx = Read("apps/web-angular/nginx.conf");
        string[] required = ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options",
            "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy",
            "Cross-Origin-Resource-Policy"];
        foreach (var header in required) Assert.Contains($"add_header {header}", nginx, StringComparison.Ordinal);
        Assert.Contains("frame-ancestors 'none'", nginx, StringComparison.Ordinal);
        Assert.DoesNotContain("location = /index.html { add_header", nginx, StringComparison.Ordinal);
    }

    [Fact]
    public void AccessAndTelemetryLogsCannotCaptureSignalRQueryTokens()
    {
        var nginx = Read("apps/web-angular/nginx.conf");
        var telemetry = Read("src/BuildingBlocks/Observability/PlatformObservability.cs");
        var host = Read("src/Host/Api/Program.cs");
        Assert.Contains("access_log /dev/stdout safe_json", nginx, StringComparison.Ordinal);
        Assert.DoesNotContain("$request_uri", nginx, StringComparison.Ordinal);
        Assert.DoesNotContain("$args", nginx, StringComparison.Ordinal);
        Assert.Contains("SensitiveTelemetryRedaction.RedactHubQuery", telemetry, StringComparison.Ordinal);
        Assert.Contains("Microsoft.AspNetCore.Hosting.Diagnostics\", LogLevel.Warning", host, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicComposeRendersTheHostTemplateAndTrustsOnlyItsWebProxy()
    {
        var dockerfile = Read("apps/web-angular/Dockerfile");
        var compose = Read("compose.public-demo.yaml");
        Assert.Contains("/etc/nginx/templates/default.conf.template", dockerfile, StringComparison.Ordinal);
        Assert.Contains("PUBLIC_HOST: ${PUBLIC_HOST:?PUBLIC_HOST is required}", compose, StringComparison.Ordinal);
        Assert.Contains("/etc/nginx/conf.d:rw,noexec,nosuid,size=1m", compose, StringComparison.Ordinal);
        Assert.Contains("Deployment__TrustedProxies__0: 127.0.0.1", compose, StringComparison.Ordinal);
        Assert.Contains("network_mode: service:web", compose, StringComparison.Ordinal);
        Assert.Contains("ASPNETCORE_URLS: http://127.0.0.1:8081", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("networks:", compose, StringComparison.Ordinal);
        Assert.Contains("proxy_pass http://${API_UPSTREAM}", Read("apps/web-angular/nginx.conf"), StringComparison.Ordinal);
    }

    private static string Read(string relativePath) => File.ReadAllText(Path.Combine(Root, relativePath));
}
