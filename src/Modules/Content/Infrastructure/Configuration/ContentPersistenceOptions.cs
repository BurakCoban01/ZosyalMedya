using System.ComponentModel.DataAnnotations;
namespace ZosyalMedya.Modules.Content.Infrastructure.Configuration;
public enum ContentPersistenceProvider { PostgreSql, MongoDb }
public sealed class ContentPersistenceOptions
{
    public const string SectionName = "Modules:Content:Persistence";
    [Required] public ContentPersistenceProvider Provider { get; init; } = ContentPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_content";
}
