using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ZosyalMedya.Modules.Administration.Application.Configuration;
using ZosyalMedya.Modules.Administration.Domain.Configuration;

namespace ZosyalMedya.Modules.Administration.Infrastructure.Persistence;
public sealed class AdministrationDbContext(DbContextOptions<AdministrationDbContext> options) : DbContext(options)
{
    public DbSet<FeatureFlag> FeatureFlags => Set<FeatureFlag>(); public DbSet<SystemSetting> Settings => Set<SystemSetting>(); public DbSet<MetricCounter> Metrics => Set<MetricCounter>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    { modelBuilder.HasDefaultSchema("administration"); var id = new ValueConverter<FeatureFlagId, Guid>(x => x.Value, x => new(x));
      var flag = modelBuilder.Entity<FeatureFlag>(); flag.ToTable("feature_flags"); flag.HasKey(x => x.Id); flag.Property(x => x.Id).HasConversion(id).ValueGeneratedNever(); flag.Property(x => x.Key).HasMaxLength(100); flag.Property(x => x.Description).HasMaxLength(500); flag.Property(x => x.Version).IsConcurrencyToken(); flag.HasIndex(x => x.Key).IsUnique(); flag.Ignore(x => x.DomainEvents);
      var setting = modelBuilder.Entity<SystemSetting>(); setting.ToTable("settings"); setting.HasKey(x => x.Id); setting.Property(x => x.Id).HasMaxLength(100).ValueGeneratedNever(); setting.Property(x => x.ValueJson).HasColumnType("jsonb"); setting.Property(x => x.Description).HasMaxLength(500); setting.Property(x => x.Version).IsConcurrencyToken(); setting.Ignore(x => x.DomainEvents);
      var metric = modelBuilder.Entity<MetricCounter>(); metric.ToTable("metrics"); metric.HasKey(x => x.Name); metric.Property(x => x.Name).HasMaxLength(100).ValueGeneratedNever(); }
}
public sealed class PostgreSqlAdministrationRepository(AdministrationDbContext db) : IAdministrationRepository
{
    public Task<FeatureFlag?> GetFlagAsync(string key, CancellationToken token) => db.FeatureFlags.AsNoTracking().SingleOrDefaultAsync(x => x.Key == key, token);
    public async Task<IReadOnlyList<FeatureFlag>> ListFlagsAsync(CancellationToken token) => await db.FeatureFlags.AsNoTracking().OrderBy(x => x.Key).ToListAsync(token);
    public async Task SaveFlagAsync(FeatureFlag flag, long? expectedVersion, CancellationToken token)
    { if (!expectedVersion.HasValue) db.Add(flag); else { var current = await db.FeatureFlags.SingleOrDefaultAsync(x => x.Id == flag.Id && x.Version == expectedVersion, token) ?? throw new InvalidOperationException("Feature flag concurrency conflict."); db.Entry(current).CurrentValues.SetValues(flag); } await db.SaveChangesAsync(token); db.ChangeTracker.Clear(); }
    public Task<SystemSetting?> GetSettingAsync(string key, CancellationToken token) => db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == key, token);
    public async Task<IReadOnlyList<SystemSetting>> ListSettingsAsync(CancellationToken token) => await db.Settings.AsNoTracking().OrderBy(x => x.Id).ToListAsync(token);
    public async Task SaveSettingAsync(SystemSetting setting, long? expectedVersion, CancellationToken token)
    { if (!expectedVersion.HasValue) db.Add(setting); else { var current = await db.Settings.SingleOrDefaultAsync(x => x.Id == setting.Id && x.Version == expectedVersion, token) ?? throw new InvalidOperationException("System setting concurrency conflict."); db.Entry(current).CurrentValues.SetValues(setting); } await db.SaveChangesAsync(token); db.ChangeTracker.Clear(); }
    public async Task IncrementMetricAsync(string name, long amount, DateTimeOffset now, CancellationToken token)
    { name = FeatureFlag.NormalizeKey(name); await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO administration.metrics (\"Name\", \"Value\", \"UpdatedAtUtc\") VALUES ({name}, {amount}, {now}) ON CONFLICT (\"Name\") DO UPDATE SET \"Value\" = administration.metrics.\"Value\" + {amount}, \"UpdatedAtUtc\" = {now}", token); }
    public async Task<IReadOnlyList<MetricCounter>> ListMetricsAsync(CancellationToken token) => await db.Metrics.AsNoTracking().OrderBy(x => x.Name).ToListAsync(token);
}
