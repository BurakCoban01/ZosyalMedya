using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.Modules.Administration.Domain.Configuration;

public readonly record struct FeatureFlagId(Guid Value) { public static FeatureFlagId New() => new(Guid.NewGuid()); }
public sealed class FeatureFlag : AggregateRoot<FeatureFlagId>
{
    private FeatureFlag() : base(default) { Key = Description = string.Empty; }
    private FeatureFlag(FeatureFlagId id, string key, string description, bool enabled, int rollout, DateTimeOffset now) : base(id)
    { Key = key; Description = description; Enabled = enabled; RolloutPercentage = rollout; CreatedAtUtc = UpdatedAtUtc = now; Version = 1; }
    public string Key { get; private set; } public string Description { get; private set; } public bool Enabled { get; private set; }
    public int RolloutPercentage { get; private set; } public DateTimeOffset CreatedAtUtc { get; private set; } public DateTimeOffset UpdatedAtUtc { get; private set; }
    public static FeatureFlag Create(FeatureFlagId id, string key, string description, bool enabled, int rollout, DateTimeOffset now)
    { var normalized = NormalizeKey(key); if (description.Trim().Length > 500 || rollout is < 0 or > 100) throw new DomainRuleException("administration.flag_invalid", "Özellik bayrağı geçersiz."); return new(id, normalized, description.Trim(), enabled, rollout, now); }
    public void Configure(string description, bool enabled, int rollout, DateTimeOffset now)
    { if (description.Trim().Length > 500 || rollout is < 0 or > 100) throw new DomainRuleException("administration.flag_invalid", "Özellik bayrağı geçersiz."); Description = description.Trim(); Enabled = enabled; RolloutPercentage = rollout; UpdatedAtUtc = now; Version++; }
    public bool IsEnabled(Guid? userId) { if (!Enabled) return false; if (RolloutPercentage >= 100 || userId is null) return RolloutPercentage >= 100; var bucket = (int)(BitConverter.ToUInt32(System.Security.Cryptography.SHA256.HashData(userId.Value.ToByteArray()), 0) % 100); return bucket < RolloutPercentage; }
    public static string NormalizeKey(string key) { var value = key.Trim().ToLowerInvariant(); if (value.Length is < 3 or > 100 || value.Any(character => !char.IsLetterOrDigit(character) && character is not '.' and not '-' and not '_')) throw new DomainRuleException("administration.key_invalid", "Ayar anahtarı geçersiz."); return value; }
}

public sealed class SystemSetting : AggregateRoot<string>
{
    private static readonly string[] Forbidden = ["secret", "password", "token", "connectionstring", "privatekey"];
    private SystemSetting() : base(string.Empty) { ValueJson = Description = string.Empty; }
    private SystemSetting(string key, string json, string description, DateTimeOffset now) : base(key)
    { ValueJson = json; Description = description; UpdatedAtUtc = now; Version = 0; }
    public string ValueJson { get; private set; } public string Description { get; private set; } public DateTimeOffset UpdatedAtUtc { get; private set; }
    public static SystemSetting Create(string key, string json, string description, DateTimeOffset now)
    { var normalized = FeatureFlag.NormalizeKey(key); if (Forbidden.Any(x => normalized.Contains(x, StringComparison.OrdinalIgnoreCase))) throw new DomainRuleException("administration.secret_setting_forbidden", "Gizli değerler sistem ayarı tablosunda tutulamaz."); var item = new SystemSetting(normalized, string.Empty, string.Empty, now); item.Update(json, description, now); return item; }
    public void Update(string json, string description, DateTimeOffset now)
    { if (json.Length > 10_000 || description.Trim().Length > 500) throw new DomainRuleException("administration.setting_invalid", "Sistem ayarı geçersiz."); try { using var _ = System.Text.Json.JsonDocument.Parse(json); } catch (System.Text.Json.JsonException exception) { throw new DomainRuleException("administration.setting_json_invalid", exception.Message); } ValueJson = json; Description = description.Trim(); UpdatedAtUtc = now; Version++; }
}

public sealed class MetricCounter
{
    private MetricCounter() { Name = string.Empty; }
    public MetricCounter(string name, long value, DateTimeOffset now) { Name = FeatureFlag.NormalizeKey(name); Value = value; UpdatedAtUtc = now; }
    public string Name { get; private set; } public long Value { get; private set; } public DateTimeOffset UpdatedAtUtc { get; private set; }
    public void Increment(long amount, DateTimeOffset now) { checked { Value += amount; } UpdatedAtUtc = now; }
}
