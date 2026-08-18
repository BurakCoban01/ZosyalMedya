using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Configuration;

public enum PersistenceProvider { PostgreSql, MongoDb }

public sealed class IdentityPersistenceOptions
{
    public const string SectionName = "Modules:Identity:Persistence";
    [Required] public PersistenceProvider Provider { get; init; } = PersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_identity";
}

public sealed class JwtOptions
{
    public const string SectionName = "Security:Jwt";
    [Required] public string Issuer { get; init; } = string.Empty;
    [Required] public string Audience { get; init; } = string.Empty;
    [Required, MinLength(32)] public string SigningKey { get; init; } = string.Empty;
    [Range(5, 60)] public int AccessTokenMinutes { get; init; } = 15;
}

public sealed class IdentityBootstrapOptions
{
    public const string SectionName = "Modules:Identity:BootstrapAdministrator";
    public bool Enabled { get; init; }
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
    public bool IsValid => !Enabled || (Username.Length is >= 3 and <= 32 && Email.Contains('@', StringComparison.Ordinal)
        && Password.Length >= 12);
}

public sealed class IdentityDeliveryOptions
{
    public const string SectionName = "Modules:Identity:Delivery";
    [Required] public string PublicWebBaseUrl { get; init; } = "http://localhost:4200";
    [Required] public string LocalPickupDirectory { get; init; } = ".local/email-pickup";
}
