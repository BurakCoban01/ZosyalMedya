using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Identity.Infrastructure.Configuration;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Security;

public sealed class AdaptivePasswordHasher : IPasswordHasher
{
    private readonly PasswordHasher<UserAccount> _hasher = new();
    public string Hash(string password) => _hasher.HashPassword(null!, password);
    public bool Verify(string hash, string password) =>
        _hasher.VerifyHashedPassword(null!, hash, password) is not PasswordVerificationResult.Failed;
}

public sealed class JwtTokenIssuer(IOptions<JwtOptions> options, TimeProvider timeProvider) : ITokenIssuer
{
    public AccessToken IssueAccessToken(UserAccount account)
    {
        var settings = options.Value;
        var now = timeProvider.GetUtcNow();
        var expires = now.AddMinutes(settings.AccessTokenMinutes);
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.SigningKey)),
            SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, account.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, account.Username),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };
        claims.AddRange(account.Roles.Select(role => new Claim("role", role.ToString())));
        var token = new JwtSecurityToken(
            settings.Issuer,
            settings.Audience,
            claims,
            now.UtcDateTime,
            expires.UtcDateTime,
            credentials);
        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}

public sealed class RefreshTokenProtector : IRefreshTokenProtector, ISecurityTokenProtector
{
    public string Generate() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));

    public string Hash(string rawToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawToken);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
    }
}
