using Xunit;

namespace ZosyalMedya.Tests.Contract;

public sealed class BrowserAuthenticationBoundaryContractTests
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));

    [Fact]
    public void BrowserSessionUsesCookieEndpointsWithoutExposingRefreshSecrets()
    {
        var contract = Read("contracts/openapi/api-v1.yaml");
        var vault = Read("apps/web-angular/src/app/core/auth/token-vault.service.ts");
        var host = Read("src/Host/Api/Program.cs");

        Assert.Contains("/api/v1/identity/browser/login:", contract, StringComparison.Ordinal);
        Assert.Contains("/api/v1/identity/browser/refresh:", contract, StringComparison.Ordinal);
        Assert.Contains("BrowserAccessToken:", contract, StringComparison.Ordinal);
        Assert.DoesNotContain("sessionStorage", vault, StringComparison.Ordinal);
        Assert.DoesNotContain("localStorage", vault, StringComparison.Ordinal);
        Assert.DoesNotContain("refreshToken", vault, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("BrowserSessionSecurity.CsrfHeaderName", host, StringComparison.Ordinal);
    }

    [Fact]
    public void NativeBearerEndpointsRemainAvailableAndPwaFallbackIsMemoryOnly()
    {
        var host = Read("src/Host/Api/Program.cs");
        var mobileStorage = Read("apps/mobile-ionic/src/app/core/auth/secure-token-storage.ts");

        Assert.Contains("identity.MapPost(\"/login\"", host, StringComparison.Ordinal);
        Assert.Contains("identity.MapPost(\"/refresh\"", host, StringComparison.Ordinal);
        Assert.Contains("identity.MapPost(\"/logout\"", host, StringComparison.Ordinal);
        Assert.Contains("BrowserMemoryTokenStorage", mobileStorage, StringComparison.Ordinal);
        Assert.DoesNotContain("sessionStorage", mobileStorage, StringComparison.Ordinal);
        Assert.Contains("Native shells must provide SECURE_TOKEN_STORAGE", mobileStorage, StringComparison.Ordinal);
    }

    [Fact]
    public void DemoMailboxRequiresAHostOnlyRegistrationCapability()
    {
        var host = Read("src/Host/Api/Program.cs");
        var browserSecurity = Read("src/Host/Api/BrowserSessionSecurity.cs");

        Assert.Contains("mailbox.Grant(result.Value!.Email, currentCapability)", host, StringComparison.Ordinal);
        Assert.Contains("DemoMailboxCookieName", host, StringComparison.Ordinal);
        Assert.Contains("mailbox.Read(request.Email, capability)", host, StringComparison.Ordinal);
        Assert.Contains("browserSession.IsSameOriginRequest", host, StringComparison.Ordinal);
        Assert.Contains("Options(httpOnly: true, maxAge: TimeSpan.FromHours(24))", browserSecurity, StringComparison.Ordinal);
        Assert.Contains("__Host-escp-demo-mailbox", browserSecurity, StringComparison.Ordinal);
    }

    private static string Read(string relativePath) => File.ReadAllText(Path.Combine(Root, relativePath));
}
