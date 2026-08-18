using Microsoft.AspNetCore.Http;
using Xunit;
using ZosyalMedya.Host.Api;

namespace ZosyalMedya.Tests.Integration.Host;

public sealed class BrowserSessionSecurityTests
{
    [Fact]
    public void ProductionCookiesAreHostOnlySecureStrictAndRefreshIsHttpOnly()
    {
        var security = new BrowserSessionSecurity(false, ["https://demo.example.com"]);
        var context = new DefaultHttpContext();

        security.Issue(context.Response, "secret-refresh");

        var cookies = context.Response.Headers.SetCookie.ToArray();
        Assert.Contains(cookies, value => value!.StartsWith("__Host-escp-browser-refresh=secret-refresh;", StringComparison.Ordinal) &&
            value.Contains("path=/", StringComparison.OrdinalIgnoreCase) &&
            value.Contains("secure", StringComparison.OrdinalIgnoreCase) &&
            value.Contains("httponly", StringComparison.OrdinalIgnoreCase) &&
            value.Contains("samesite=strict", StringComparison.OrdinalIgnoreCase) &&
            !value.Contains("domain=", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(cookies, value => value!.StartsWith("__Host-escp-browser-csrf=", StringComparison.Ordinal) &&
            !value.Contains("httponly", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(null, null, false)]
    [InlineData("https://evil.example", "same-origin", false)]
    [InlineData("https://demo.example.com", "cross-site", false)]
    [InlineData("https://demo.example.com", "same-origin", true)]
    public void OriginAndFetchMetadataFailClosed(string? origin, string? fetchSite, bool expected)
    {
        var security = new BrowserSessionSecurity(false, ["https://demo.example.com"]);
        var context = new DefaultHttpContext();
        if (origin is not null) context.Request.Headers.Origin = origin;
        if (fetchSite is not null) context.Request.Headers["Sec-Fetch-Site"] = fetchSite;

        Assert.Equal(expected, security.IsSameOriginRequest(context.Request));
    }

    [Fact]
    public void CsrfRequiresMatchingCookieAndHeader()
    {
        var security = new BrowserSessionSecurity(true, ["http://localhost:4200"]);
        var context = new DefaultHttpContext();
        context.Request.Headers.Cookie = "escp-browser-csrf=expected";
        context.Request.Headers[BrowserSessionSecurity.CsrfHeaderName] = "wrong";
        Assert.False(security.HasValidCsrf(context.Request));

        context.Request.Headers[BrowserSessionSecurity.CsrfHeaderName] = "expected";
        Assert.True(security.HasValidCsrf(context.Request));
    }
}
