using Microsoft.Extensions.Configuration;
using Xunit;
using ZosyalMedya.BuildingBlocks.Infrastructure.Deployment;

namespace ZosyalMedya.Tests.Integration.Host;

public sealed class ApiRuntimeConfigurationTests
{
    [Fact]
    public void DevelopmentStillRequiresCryptographicallyUsableSigningKey()
    {
        var values = ValidValues();
        values["Security:Jwt:SigningKey"] = "short";

        var error = Assert.Throws<InvalidOperationException>(() => Load(values, isDevelopment: true));

        Assert.Contains("at least 32", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("key-path")]
    [InlineData("trusted-proxy")]
    [InlineData("local-redis")]
    [InlineData("development-redis")]
    [InlineData("wildcard-host")]
    [InlineData("http-origin")]
    [InlineData("placeholder-signing-key")]
    [InlineData("degenerate-signing-key")]
    [InlineData("loopback-redis")]
    [InlineData("loopback-host")]
    [InlineData("transient-data-root")]
    [InlineData("unsafe-proxy")]
    [InlineData("root-with-transient-keys")]
    [InlineData("redis-without-endpoint")]
    public void ProductionRejectsLocalPlaceholderAndImplicitTrustConfiguration(string unsafeSetting)
    {
        var values = ValidValues();
        switch (unsafeSetting)
        {
            case "key-path": values.Remove("Deployment:DataProtectionKeysPath"); break;
            case "trusted-proxy": values.Remove("Deployment:TrustedProxies:0"); break;
            case "local-redis": values["Redis:ConnectionString"] = "localhost:6379"; break;
            case "development-redis": values["Redis:Environment"] = "development"; break;
            case "wildcard-host": values["AllowedHosts"] = "*"; break;
            case "http-origin": values["Security:AllowedOrigins:0"] = "http://localhost:4200"; break;
            case "placeholder-signing-key": values["Security:Jwt:SigningKey"] = "replace_with_a_real_random_secret"; break;
            case "degenerate-signing-key": values["Security:Jwt:SigningKey"] = Convert.ToBase64String(new byte[32]); break;
            case "loopback-redis": values["Redis:ConnectionString"] = "127.0.0.2:6379"; break;
            case "loopback-host": values["AllowedHosts"] = "127.0.0.2"; break;
            case "transient-data-root":
                values["Deployment:PersistentDataRoot"] = Path.GetTempPath();
                values["Deployment:DataProtectionKeysPath"] = Path.Combine(Path.GetTempPath(), "keys");
                break;
            case "unsafe-proxy": values["Deployment:TrustedProxies:0"] = "0.0.0.0"; break;
            case "root-with-transient-keys":
                values["Deployment:PersistentDataRoot"] = Path.GetPathRoot(Path.GetTempPath());
                values["Deployment:DataProtectionKeysPath"] = Path.Combine(Path.GetTempPath(), "keys");
                break;
            case "redis-without-endpoint": values["Redis:ConnectionString"] = "abortConnect=false"; break;
            default: throw new InvalidOperationException($"Unknown test case: {unsafeSetting}");
        }

        Assert.Throws<InvalidOperationException>(() => Load(values, isDevelopment: false));
    }

    [Fact]
    public void ProductionAcceptsExplicitPersistentAndProxyBoundary()
    {
        var configuration = Load(ValidValues(), isDevelopment: false);

        Assert.StartsWith("redis:6379", configuration.RedisConnectionString, StringComparison.Ordinal);
        Assert.Equal("203.0.113.10", Assert.Single(configuration.TrustedProxies).ToString());
        Assert.True(Path.IsPathRooted(configuration.DataProtectionKeysPath));
    }

    [Fact]
    public void ProductionAcceptsExplicitLoopbackSidecarProxyBoundary()
    {
        var values = ValidValues();
        values["Deployment:TrustedProxies:0"] = "127.0.0.1";

        var configuration = Load(values, isDevelopment: false);

        Assert.Equal(System.Net.IPAddress.Loopback, Assert.Single(configuration.TrustedProxies));
    }

    [Theory]
    [InlineData("postgres")]
    [InlineData("redis")]
    [InlineData("mongodb")]
    [InlineData("mongodb-uppercase-placeholder")]
    [InlineData("mongodb-low-diversity")]
    [InlineData("mongodb-provider")]
    [InlineData("mongodb-unauthenticated")]
    [InlineData("mongodb-external")]
    [InlineData("mongodb-database")]
    [InlineData("minio-user")]
    [InlineData("minio-password")]
    [InlineData("storage-provider")]
    [InlineData("antivirus-provider")]
    [InlineData("visitor-domain-missing")]
    [InlineData("visitor-domain-seed")]
    [InlineData("visitor-domain-public")]
    public void PublicDemoRejectsPlaceholderCredentialsAndDisabledMediaProtection(string unsafeSetting)
    {
        var values = ValidValues();
        switch (unsafeSetting)
        {
            case "postgres": values[PostgreSqlConnectionKeys[0]] = "Host=postgres;Database=platform;Username=platform;Password=replace_with_a_database_password"; break;
            case "redis": values["Redis:ConnectionString"] = "redis:6379,password=replace_with_a_redis_password,abortConnect=false"; break;
            case "mongodb": values["Deployment:MongoAppPassword"] = "replace_with_a_mongodb_password"; break;
            case "mongodb-uppercase-placeholder": values["Deployment:MongoAppPassword"] = "REPLACE_WITH_A_MONGODB_PASSWORD"; break;
            case "mongodb-low-diversity": values["Deployment:MongoAppPassword"] = new string('a', 32); break;
            case "mongodb-provider": values["Modules:Questions:Persistence:Provider"] = "PostgreSql"; break;
            case "mongodb-unauthenticated": values["Modules:Questions:Persistence:MongoConnectionString"] = "mongodb://mongodb:27017/platform"; break;
            case "mongodb-external": values["Modules:Questions:Persistence:MongoConnectionString"] = "mongodb://platform:Mongo_App_Public_Demo_9f4b2d7a6c1e@example.com:27017/platform"; break;
            case "mongodb-database": values["Modules:Questions:Persistence:MongoDatabaseName"] = "other"; break;
            case "minio-user": values["Modules:Media:MinioAccessKey"] = "replace_with_a_minio_user"; break;
            case "minio-password": values["Modules:Media:MinioSecretKey"] = "replace_with_a_minio_password"; break;
            case "storage-provider": values["Modules:Media:ObjectStorageProvider"] = "FileSystem"; break;
            case "antivirus-provider": values["Modules:Media:AntivirusProvider"] = "NoOp"; break;
            case "visitor-domain-missing": values.Remove("PublicDemo:VisitorEmailDomain"); break;
            case "visitor-domain-seed": values["PublicDemo:VisitorEmailDomain"] = "demo.escp.test"; break;
            case "visitor-domain-public": values["PublicDemo:VisitorEmailDomain"] = "example.com"; break;
            default: throw new InvalidOperationException($"Unknown test case: {unsafeSetting}");
        }

        Assert.Throws<InvalidOperationException>(() => Load(values, isDevelopment: false));
    }

    [Fact]
    public void DevelopmentUsesLocalKeyPathAndLoopbackProxyDefaults()
    {
        var values = ValidValues();
        values.Remove("Deployment:PersistentDataRoot");
        values.Remove("Deployment:DataProtectionKeysPath");
        values.Remove("Deployment:TrustedProxies:0");

        var configuration = Load(values, isDevelopment: true);

        Assert.EndsWith(Path.Combine(".local", "data-protection-keys"), configuration.DataProtectionKeysPath, StringComparison.Ordinal);
        Assert.Contains(System.Net.IPAddress.Loopback, configuration.TrustedProxies);
        Assert.Contains(System.Net.IPAddress.IPv6Loopback, configuration.TrustedProxies);
    }

    private static ApiRuntimeConfiguration Load(Dictionary<string, string?> values, bool isDevelopment)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return ApiRuntimeConfiguration.Load(configuration, isDevelopment, Path.GetTempPath());
    }

    private static readonly string[] PostgreSqlConnectionKeys =
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

    private static Dictionary<string, string?> ValidValues()
    {
        var values = new Dictionary<string, string?>
        {
            ["AllowedHosts"] = "demo.example.com",
            ["Security:Jwt:SigningKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()),
            ["Security:Jwt:Issuer"] = "enterprise-social-community-platform-api",
            ["Security:Jwt:Audience"] = "enterprise-social-community-platform-clients",
            ["Security:AllowedOrigins:0"] = "https://demo.example.com",
            ["Redis:ConnectionString"] = "redis:6379,password=Redis_Public_Demo_9f4b2d7a6c1e,abortConnect=false",
            ["Redis:Environment"] = "public-demo",
            ["Deployment:PersistentDataRoot"] = Path.Combine(AppContext.BaseDirectory, "persistent-data-test"),
            ["Deployment:DataProtectionKeysPath"] = Path.Combine(AppContext.BaseDirectory, "persistent-data-test", "keys"),
            ["Deployment:TrustedProxies:0"] = "203.0.113.10",
            ["Deployment:MongoAppPassword"] = "Mongo_App_Public_Demo_9f4b2d7a6c1e",
            ["PUBLIC_DEMO_MODE"] = "true",
            ["PublicDemo:VisitorEmailDomain"] = "visitor.escp.test",
            ["Modules:Media:ObjectStorageProvider"] = "Minio",
            ["Modules:Media:AntivirusProvider"] = "ClamAv",
            ["Modules:Media:MinioAccessKey"] = "MinioPublic9f4b",
            ["Modules:Media:MinioSecretKey"] = "Minio_Public_Demo_9f4b2d7a6c1e"
        };
        values["Modules:Questions:Persistence:Provider"] = "MongoDb";
        values["Modules:Questions:Persistence:MongoConnectionString"] =
            "mongodb://platform:Mongo_App_Public_Demo_9f4b2d7a6c1e@mongodb:27017/platform?authSource=platform";
        values["Modules:Questions:Persistence:MongoDatabaseName"] = "platform";
        foreach (var key in PostgreSqlConnectionKeys)
            values[key] = "Host=postgres;Database=platform;Username=platform;Password=Postgres_Public_Demo_9f4b2d7a6c1e";
        return values;
    }
}
