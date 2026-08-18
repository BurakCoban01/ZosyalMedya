using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.Profiles.Infrastructure.Configuration;

public enum ProfilesPersistenceProvider { PostgreSql, MongoDb }

public sealed class ProfilesPersistenceOptions
{
    public const string SectionName = "Modules:Profiles:Persistence";
    [Required] public ProfilesPersistenceProvider Provider { get; init; } = ProfilesPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_profiles";
}
