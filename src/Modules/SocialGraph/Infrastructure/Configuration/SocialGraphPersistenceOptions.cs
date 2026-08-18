using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Configuration;

public enum SocialGraphPersistenceProvider { PostgreSql, MongoDb }

public sealed class SocialGraphPersistenceOptions
{
    public const string SectionName = "Modules:SocialGraph:Persistence";
    [Required] public SocialGraphPersistenceProvider Provider { get; init; } = SocialGraphPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_social_graph";
}
