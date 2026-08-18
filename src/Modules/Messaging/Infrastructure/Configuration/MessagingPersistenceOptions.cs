using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.Messaging.Infrastructure.Configuration;

public enum MessagingPersistenceProvider { PostgreSql, MongoDb }
public sealed class MessagingPersistenceOptions
{
    public const string SectionName = "Modules:Messaging:Persistence";
    public MessagingPersistenceProvider Provider { get; init; } = MessagingPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_messaging";
}
