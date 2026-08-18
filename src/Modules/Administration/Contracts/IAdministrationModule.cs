namespace ZosyalMedya.Modules.Administration.Contracts;
public interface IFeatureFlagService { Task<bool> IsEnabledAsync(string key, Guid? userId = null, CancellationToken cancellationToken = default); }
public interface IOperationalMetrics { Task IncrementAsync(string name, long amount = 1, CancellationToken cancellationToken = default); }
