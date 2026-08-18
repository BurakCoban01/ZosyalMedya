using System.ComponentModel.DataAnnotations;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Redis;

public sealed class RedisOptions
{
    public const string SectionName = "Redis";
    [Required] public string ConnectionString { get; init; } = string.Empty;
    [Required] public string Environment { get; init; } = "development";
    [Required] public string Application { get; init; } = "enterprise-social-community-platform";
    [Range(1, 60)] public int ConnectTimeoutSeconds { get; init; } = 5;
}
