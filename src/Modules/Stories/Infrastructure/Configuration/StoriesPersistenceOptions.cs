using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.Stories.Infrastructure.Configuration;

public enum StoriesPersistenceProvider { PostgreSql, MongoDb }
public sealed class StoriesPersistenceOptions
{
    public const string SectionName = "Modules:Stories:Persistence";
    [Required] public StoriesPersistenceProvider Provider { get; init; } = StoriesPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_stories";
}
