namespace ZosyalMedya.Modules.Audit.Contracts;

public enum AuditSeverity { Information, Warning, Critical }
public sealed record AuditRecord(Guid? ActorId, string Action, string TargetType, string TargetId,
    AuditSeverity Severity, IReadOnlyDictionary<string, string> Metadata, string CorrelationId);
public interface IAuditModule
{
    Task WriteAsync(AuditRecord record, CancellationToken cancellationToken = default);
}
