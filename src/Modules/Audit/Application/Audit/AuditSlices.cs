using System.Text.Json;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Audit.Domain.Entries;

namespace ZosyalMedya.Modules.Audit.Application.Audit;

public sealed record AuditEntryView(Guid Id, Guid? ActorId, string Action, string TargetType, string TargetId,
    string Severity, IReadOnlyDictionary<string, string> Metadata, string CorrelationId, DateTimeOffset OccurredAtUtc);
public interface IAuditRepository
{
    Task AppendAsync(AuditEntry entry, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AuditEntry>> SearchAsync(Guid? actorId, string? action, string? targetType,
        DateTimeOffset? from, DateTimeOffset? until, int limit, CancellationToken cancellationToken = default);
}

public sealed class AuditModule(IAuditRepository repository, IClock clock) : IAuditModule
{
    public Task WriteAsync(AuditRecord record, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(record.Metadata);
        var entry = AuditEntry.Create(AuditEntryId.New(), record, json, clock.UtcNow);
        return repository.AppendAsync(entry, cancellationToken);
    }
}

public sealed class SearchAuditHandler(IAuditRepository repository)
{
    public async Task<IReadOnlyList<AuditEntryView>> HandleAsync(Guid? actorId, string? action, string? targetType,
        DateTimeOffset? from, DateTimeOffset? until, int limit, CancellationToken token) =>
        (await repository.SearchAsync(actorId, action, targetType, from, until, Math.Clamp(limit, 1, 200), token))
        .Select(Map).ToArray();
    private static AuditEntryView Map(AuditEntry entry) => new(entry.Id.Value, entry.ActorId, entry.Action,
        entry.TargetType, entry.TargetId, entry.Severity.ToString(),
        JsonSerializer.Deserialize<Dictionary<string, string>>(entry.MetadataJson) ?? [], entry.CorrelationId,
        entry.OccurredAtUtc);
}
