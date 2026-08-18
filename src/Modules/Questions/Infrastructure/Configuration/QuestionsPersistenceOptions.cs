using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.Modules.Questions.Infrastructure.Configuration;

public enum QuestionsPersistenceProvider { PostgreSql, MongoDb }
public sealed class QuestionsPersistenceOptions
{
    public const string SectionName = "Modules:Questions:Persistence";
    [Required] public QuestionsPersistenceProvider Provider { get; init; } = QuestionsPersistenceProvider.PostgreSql;
    [Required] public string PostgreSqlConnectionString { get; init; } = string.Empty;
    [Required] public string MongoConnectionString { get; init; } = string.Empty;
    [Required] public string MongoDatabaseName { get; init; } = "zosyalmedya_questions";
}
