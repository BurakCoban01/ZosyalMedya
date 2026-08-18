using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using Npgsql;
using StackExchange.Redis;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Deployment;

public sealed record ApiRuntimeConfiguration(
    string JwtSigningKey,
    string RedisConnectionString,
    string DataProtectionKeysPath,
    string[] AllowedOrigins,
    IPAddress[] TrustedProxies)
{
    private static readonly string[] PublicDemoPostgreSqlConnectionKeys =
    [
        "Modules:Identity:Persistence:PostgreSqlConnectionString",
        "Modules:Profiles:Persistence:PostgreSqlConnectionString",
        "Modules:SocialGraph:Persistence:PostgreSqlConnectionString",
        "Modules:Questions:Persistence:PostgreSqlConnectionString",
        "Modules:Content:Persistence:PostgreSqlConnectionString",
        "Modules:Reactions:Persistence:PostgreSqlConnectionString",
        "Modules:Comments:Persistence:PostgreSqlConnectionString",
        "Modules:Messaging:Persistence:PostgreSqlConnectionString",
        "Modules:Notifications:Persistence:PostgreSqlConnectionString",
        "Modules:Stories:Persistence:PostgreSqlConnectionString",
        "Modules:Communities:Persistence:PostgreSqlConnectionString",
        "Modules:Media:PostgreSqlConnectionString",
        "Modules:Search:PostgreSqlConnectionString",
        "Modules:Audit:PostgreSqlConnectionString",
        "Modules:Moderation:PostgreSqlConnectionString",
        "Modules:Administration:PostgreSqlConnectionString",
        "Integration:Outbox:PostgreSqlConnectionString"
    ];

    public static ApiRuntimeConfiguration Load(
        IConfiguration configuration,
        bool isDevelopment,
        string contentRootPath)
    {
        var signingKey = Require(configuration, "Security:Jwt:SigningKey");
        if (Encoding.UTF8.GetByteCount(signingKey) < 32)
            throw new InvalidOperationException("Security:Jwt:SigningKey must contain at least 32 UTF-8 bytes.");

        _ = Require(configuration, "Security:Jwt:Issuer");
        _ = Require(configuration, "Security:Jwt:Audience");
        var redisConnection = Require(configuration, "Redis:ConnectionString");
        var allowedOrigins = configuration.GetSection("Security:AllowedOrigins").Get<string[]>() ?? [];
        if (allowedOrigins.Length == 0)
            throw new InvalidOperationException("Security:AllowedOrigins must contain at least one origin.");

        var configuredKeyPath = configuration["Deployment:DataProtectionKeysPath"];
        var keyPath = string.IsNullOrWhiteSpace(configuredKeyPath)
            ? Path.Combine(contentRootPath, ".local", "data-protection-keys")
            : configuredKeyPath;

        var configuredProxies = configuration.GetSection("Deployment:TrustedProxies").Get<string[]>() ?? [];
        var trustedProxies = configuredProxies.Select(ParseProxy).ToArray();

        if (!isDevelopment)
        {
            Span<byte> decodedKey = stackalloc byte[signingKey.Length];
            if (!Convert.TryFromBase64String(signingKey, decodedKey, out var decodedLength) || decodedLength < 32 ||
                decodedKey[..decodedLength].ToArray().Distinct().Count() < 8)
                throw new InvalidOperationException("Security:Jwt:SigningKey must be base64-encoded key material of at least 32 bytes outside Development.");

            var configuredDataRoot = configuration["Deployment:PersistentDataRoot"];
            if (string.IsNullOrWhiteSpace(configuredDataRoot) || !Path.IsPathRooted(configuredDataRoot))
                throw new InvalidOperationException("Deployment:PersistentDataRoot must be an absolute persistent path outside Development.");
            if (string.IsNullOrWhiteSpace(configuredKeyPath) || !Path.IsPathRooted(configuredKeyPath))
                throw new InvalidOperationException("Deployment:DataProtectionKeysPath must be an absolute persistent path outside Development.");
            var dataRoot = Path.GetFullPath(configuredDataRoot);
            keyPath = Path.GetFullPath(configuredKeyPath);
            if (IsFileSystemRoot(dataRoot) || IsTransientPath(dataRoot) || IsTransientPath(keyPath) || !IsWithin(keyPath, dataRoot))
                throw new InvalidOperationException("Deployment:DataProtectionKeysPath must be inside a non-transient Deployment:PersistentDataRoot.");
            if (trustedProxies.Length == 0)
                throw new InvalidOperationException("Deployment:TrustedProxies must explicitly identify the ingress proxy outside Development.");
            if (trustedProxies.Any(address => address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any)))
                throw new InvalidOperationException("Deployment:TrustedProxies cannot contain unspecified addresses outside Development.");
            if (IsLocalEndpoint(redisConnection))
                throw new InvalidOperationException("Redis:ConnectionString cannot target localhost outside Development.");
            if (string.Equals(configuration["Redis:Environment"], "development", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Redis:Environment cannot be development outside Development.");

            if (configuration.GetValue<bool>("PUBLIC_DEMO_MODE"))
                ValidatePublicDemoInfrastructure(configuration, redisConnection);

            var allowedHosts = Require(configuration, "AllowedHosts")
                .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (allowedHosts.Length == 0 || allowedHosts.Any(host => host is "*" || IsLocalHost(host)))
                throw new InvalidOperationException("AllowedHosts must contain only explicit public hosts outside Development.");

            foreach (var origin in allowedOrigins)
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
                    uri.Scheme != Uri.UriSchemeHttps || IsLocalHost(uri.Host))
                    throw new InvalidOperationException("Security:AllowedOrigins must contain only explicit HTTPS public origins outside Development.");
            }
        }
        else if (trustedProxies.Length == 0)
        {
            trustedProxies = [IPAddress.Loopback, IPAddress.IPv6Loopback];
        }

        ProbeWritableDirectory(keyPath);
        return new(signingKey, redisConnection, Path.GetFullPath(keyPath), allowedOrigins, trustedProxies);
    }

    private static string Require(IConfiguration configuration, string key) =>
        string.IsNullOrWhiteSpace(configuration[key])
            ? throw new InvalidOperationException($"Required configuration '{key}' is missing.")
            : configuration[key]!;

    private static IPAddress ParseProxy(string value) =>
        IPAddress.TryParse(value, out var address)
            ? address
            : throw new InvalidOperationException($"Deployment:TrustedProxies contains invalid IP address '{value}'.");

    private static bool IsLocalEndpoint(string value)
    {
        ConfigurationOptions options;
        try { options = ConfigurationOptions.Parse(value); }
        catch (Exception error) { throw new InvalidOperationException("Redis:ConnectionString is invalid.", error); }
        if (options.EndPoints.Count == 0)
            throw new InvalidOperationException("Redis:ConnectionString must contain at least one endpoint.");

        return options.EndPoints.Any(endpoint => endpoint switch
        {
            IPEndPoint ip => IsUnsafeAddress(ip.Address),
            DnsEndPoint dns => IsLocalHost(dns.Host),
            _ => true
        });
    }

    private static void ValidatePublicDemoInfrastructure(IConfiguration configuration, string redisConnection)
    {
        var visitorEmailDomain = Require(configuration, "PublicDemo:VisitorEmailDomain").Trim().TrimStart('@');
        if (!visitorEmailDomain.EndsWith(".test", StringComparison.OrdinalIgnoreCase) ||
            visitorEmailDomain.Equals("demo.escp.test", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("PublicDemo:VisitorEmailDomain must use a dedicated .test namespace that does not overlap protected seed identities.");

        ConfigurationOptions redisOptions;
        try { redisOptions = ConfigurationOptions.Parse(redisConnection); }
        catch (Exception error) { throw new InvalidOperationException("Redis:ConnectionString is invalid.", error); }
        RejectWeakSecret("Redis:ConnectionString password", redisOptions.Password, 24);
        var mongoAppPassword = Require(configuration, "Deployment:MongoAppPassword");
        RejectWeakSecret("Deployment:MongoAppPassword", mongoAppPassword, 24);
        ValidatePublicDemoMongoConnection(configuration, mongoAppPassword);

        foreach (var key in PublicDemoPostgreSqlConnectionKeys)
        {
            NpgsqlConnectionStringBuilder builder;
            try { builder = new NpgsqlConnectionStringBuilder(Require(configuration, key)); }
            catch (Exception error) when (error is not InvalidOperationException)
            {
                throw new InvalidOperationException($"Required public-demo PostgreSQL configuration '{key}' is invalid.", error);
            }
            RejectWeakSecret($"{key} password", builder.Password, 24);
        }

        if (!string.Equals(Require(configuration, "Modules:Media:ObjectStorageProvider"), "Minio", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Public demo media storage must use the Minio provider.");
        if (!string.Equals(Require(configuration, "Modules:Media:AntivirusProvider"), "ClamAv", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Public demo media scanning must use the ClamAv provider.");

        RejectWeakSecret("Modules:Media:MinioAccessKey", Require(configuration, "Modules:Media:MinioAccessKey"), 12);
        RejectWeakSecret("Modules:Media:MinioSecretKey", Require(configuration, "Modules:Media:MinioSecretKey"), 24);
    }

    private static void RejectWeakSecret(string name, string? value, int minimumLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length < minimumLength ||
            value.Contains("replace_with", StringComparison.OrdinalIgnoreCase) ||
            value.Contains("change_me", StringComparison.OrdinalIgnoreCase) ||
            value.Distinct().Count() < 8)
            throw new InvalidOperationException($"{name} must contain unique, non-placeholder secret material of at least {minimumLength} characters.");
    }

    private static void ValidatePublicDemoMongoConnection(IConfiguration configuration, string expectedPassword)
    {
        var value = Require(configuration, "Modules:Questions:Persistence:MongoConnectionString");
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !uri.Scheme.Equals("mongodb", StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Equals("mongodb", StringComparison.OrdinalIgnoreCase) ||
            uri.Port != 27017)
            throw new InvalidOperationException("The public-demo Questions MongoDB connection must target the internal mongodb service.");

        var credentials = uri.UserInfo.Split(':', 2);
        if (credentials.Length != 2 || !Uri.UnescapeDataString(credentials[0]).Equals("platform", StringComparison.Ordinal) ||
            !Uri.UnescapeDataString(credentials[1]).Equals(expectedPassword, StringComparison.Ordinal))
            throw new InvalidOperationException("The public-demo Questions MongoDB connection must use the configured application credential.");
        if (!string.Equals(configuration["Modules:Questions:Persistence:Provider"], "MongoDb", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("The public-demo Questions persistence provider must be MongoDb.");
        if (!string.Equals(configuration["Modules:Questions:Persistence:MongoDatabaseName"], "platform", StringComparison.Ordinal))
            throw new InvalidOperationException("The public-demo Questions MongoDB database must match the application user's platform grant.");
    }

    private static bool IsLocalHost(string value)
    {
        var normalized = value.Trim().Trim('[', ']');
        return normalized.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            normalized.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
            IPAddress.TryParse(normalized, out var address) && IsUnsafeAddress(address);
    }

    private static bool IsUnsafeAddress(IPAddress address) =>
        IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any);

    private static bool IsWithin(string path, string root)
    {
        var relative = Path.GetRelativePath(root, path);
        return relative != ".." && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal) &&
            !Path.IsPathRooted(relative);
    }

    private static bool IsTransientPath(string path)
    {
        var fullPath = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var tempPath = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (fullPath.Equals(tempPath, StringComparison.OrdinalIgnoreCase) || IsWithin(fullPath, tempPath)) return true;
        if (!OperatingSystem.IsWindows())
            return fullPath is "/tmp" or "/var/tmp" or "/dev/shm" ||
                fullPath.StartsWith("/tmp/", StringComparison.Ordinal) ||
                fullPath.StartsWith("/var/tmp/", StringComparison.Ordinal) ||
                fullPath.StartsWith("/dev/shm/", StringComparison.Ordinal);
        return false;
    }

    private static bool IsFileSystemRoot(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var normalized = fullPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var root = Path.GetPathRoot(fullPath)?.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return string.Equals(normalized, root, StringComparison.OrdinalIgnoreCase);
    }

    private static void ProbeWritableDirectory(string path)
    {
        Directory.CreateDirectory(path);
        var probePath = Path.Combine(path, $".write-probe-{Guid.NewGuid():N}");
        try
        {
            using var stream = new FileStream(probePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.WriteThrough);
            stream.WriteByte(1);
            stream.Flush(flushToDisk: true);
        }
        catch (Exception error)
        {
            throw new InvalidOperationException("Deployment:DataProtectionKeysPath is not writable.", error);
        }
        finally
        {
            if (File.Exists(probePath)) File.Delete(probePath);
        }
    }
}
