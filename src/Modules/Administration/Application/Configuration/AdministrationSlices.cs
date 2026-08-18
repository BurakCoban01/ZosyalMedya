using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Administration.Contracts;
using ZosyalMedya.Modules.Administration.Domain.Configuration;
using ZosyalMedya.Modules.Audit.Contracts;

namespace ZosyalMedya.Modules.Administration.Application.Configuration;
public interface IAdministrationRepository
{
    Task<FeatureFlag?> GetFlagAsync(string key, CancellationToken token); Task<IReadOnlyList<FeatureFlag>> ListFlagsAsync(CancellationToken token);
    Task SaveFlagAsync(FeatureFlag flag, long? expectedVersion, CancellationToken token); Task<SystemSetting?> GetSettingAsync(string key, CancellationToken token);
    Task<IReadOnlyList<SystemSetting>> ListSettingsAsync(CancellationToken token); Task SaveSettingAsync(SystemSetting setting, long? expectedVersion, CancellationToken token);
    Task IncrementMetricAsync(string name, long amount, DateTimeOffset now, CancellationToken token); Task<IReadOnlyList<MetricCounter>> ListMetricsAsync(CancellationToken token);
}
public sealed record FeatureFlagView(string Key, string Description, bool Enabled, int RolloutPercentage, long Version);
public sealed record SystemSettingView(string Key, string ValueJson, string Description, long Version);
public sealed record OperationsDashboard(IReadOnlyList<FeatureFlagView> Flags, IReadOnlyList<SystemSettingView> Settings,
    IReadOnlyDictionary<string, long> Metrics, IReadOnlyList<string> BackgroundJobs);

public sealed class AdministrationHandler(IAdministrationRepository repository, IAuditModule audit, IClock clock)
{
    public async Task<FeatureFlagView> SetFlagAsync(Guid actorId, string key, string description, bool enabled, int rollout,
        string correlationId, CancellationToken token)
    { var normalized = FeatureFlag.NormalizeKey(key); var item = await repository.GetFlagAsync(normalized, token); var version = item?.Version;
      if (item is null) item = FeatureFlag.Create(FeatureFlagId.New(), normalized, description, enabled, rollout, clock.UtcNow); else item.Configure(description, enabled, rollout, clock.UtcNow);
      await repository.SaveFlagAsync(item, version, token); await audit.WriteAsync(new(actorId, "administration.flag.changed", "FeatureFlag", normalized,
          AuditSeverity.Warning, new Dictionary<string, string> { ["enabled"] = enabled.ToString(), ["rollout"] = rollout.ToString(System.Globalization.CultureInfo.InvariantCulture) }, correlationId), token);
      return Map(item); }
    public async Task<SystemSettingView> SetSettingAsync(Guid actorId, string key, string json, string description,
        string correlationId, CancellationToken token)
    { var normalized = FeatureFlag.NormalizeKey(key); var item = await repository.GetSettingAsync(normalized, token); var version = item?.Version;
      if (item is null) item = SystemSetting.Create(normalized, json, description, clock.UtcNow); else item.Update(json, description, clock.UtcNow);
      await repository.SaveSettingAsync(item, version, token); await audit.WriteAsync(new(actorId, "administration.setting.changed", "SystemSetting", normalized,
          AuditSeverity.Warning, new Dictionary<string, string> { ["description"] = description }, correlationId), token); return Map(item); }
    public async Task<OperationsDashboard> DashboardAsync(CancellationToken token) => new(
        (await repository.ListFlagsAsync(token)).Select(Map).ToArray(), (await repository.ListSettingsAsync(token)).Select(Map).ToArray(),
        (await repository.ListMetricsAsync(token)).ToDictionary(x => x.Name, x => x.Value),
        ["notification-delivery", "media-orphan-cleanup", "search-index-projection"]);
    private static FeatureFlagView Map(FeatureFlag x) => new(x.Key, x.Description, x.Enabled, x.RolloutPercentage, x.Version);
    private static SystemSettingView Map(SystemSetting x) => new(x.Id, x.ValueJson, x.Description, x.Version);
}
public sealed class AdministrationModule(IAdministrationRepository repository, IClock clock) : IFeatureFlagService, IOperationalMetrics
{
    public async Task<bool> IsEnabledAsync(string key, Guid? userId = null, CancellationToken cancellationToken = default) =>
        await repository.GetFlagAsync(FeatureFlag.NormalizeKey(key), cancellationToken) is { } flag && flag.IsEnabled(userId);
    public Task IncrementAsync(string name, long amount = 1, CancellationToken cancellationToken = default) => repository.IncrementMetricAsync(name, amount, clock.UtcNow, cancellationToken);
}
