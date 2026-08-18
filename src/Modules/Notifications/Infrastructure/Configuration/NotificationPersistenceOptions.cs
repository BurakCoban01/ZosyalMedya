using System.ComponentModel.DataAnnotations;
namespace ZosyalMedya.Modules.Notifications.Infrastructure.Configuration;
public enum NotificationPersistenceProvider { PostgreSql, MongoDb }
public sealed class NotificationPersistenceOptions
{
    public const string SectionName="Modules:Notifications:Persistence";
    public NotificationPersistenceProvider Provider{get;init;}=NotificationPersistenceProvider.PostgreSql;
    [Required]public string PostgreSqlConnectionString{get;init;}=string.Empty;
    [Required]public string MongoConnectionString{get;init;}=string.Empty;
    [Required]public string MongoDatabaseName{get;init;}="zosyalmedya_notifications";
}
