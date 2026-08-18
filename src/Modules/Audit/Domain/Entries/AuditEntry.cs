using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Audit.Contracts;

namespace ZosyalMedya.Modules.Audit.Domain.Entries;

public readonly record struct AuditEntryId(Guid Value) { public static AuditEntryId New() => new(Guid.NewGuid()); }

public sealed class AuditEntry : Entity<AuditEntryId>
{
    private static readonly string[] ForbiddenMetadataKeys = ["password", "secret", "token", "authorization", "cookie"];
    private AuditEntry() : base(default) { Action = TargetType = TargetId = MetadataJson = CorrelationId = string.Empty; }
    private AuditEntry(AuditEntryId id, AuditRecord record, string metadataJson, DateTimeOffset now) : base(id)
    {
        ActorId = record.ActorId; Action = record.Action; TargetType = record.TargetType; TargetId = record.TargetId;
        Severity = record.Severity; MetadataJson = metadataJson; CorrelationId = record.CorrelationId; OccurredAtUtc = now;
    }
    public Guid? ActorId { get; private set; }
    public string Action { get; private set; }
    public string TargetType { get; private set; }
    public string TargetId { get; private set; }
    public AuditSeverity Severity { get; private set; }
    public string MetadataJson { get; private set; }
    public string CorrelationId { get; private set; }
    public DateTimeOffset OccurredAtUtc { get; private set; }
    public static AuditEntry Create(AuditEntryId id, AuditRecord record, string metadataJson, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(record.Action) || string.IsNullOrWhiteSpace(record.TargetType) ||
            string.IsNullOrWhiteSpace(record.TargetId)) throw new DomainRuleException("audit.record_invalid", "Denetim kaydı geçersiz.");
        if (record.Metadata.Keys.Any(key => ForbiddenMetadataKeys.Any(forbidden => key.Contains(forbidden, StringComparison.OrdinalIgnoreCase))))
            throw new DomainRuleException("audit.sensitive_metadata", "Denetim metadata'sı hassas anahtar içeremez.");
        if (metadataJson.Length > 16_000) throw new DomainRuleException("audit.metadata_too_large", "Denetim metadata'sı çok büyük.");
        return new(id, record with { Action = record.Action.Trim()[..Math.Min(record.Action.Trim().Length, 100)],
            TargetType = record.TargetType.Trim()[..Math.Min(record.TargetType.Trim().Length, 100)],
            TargetId = record.TargetId.Trim()[..Math.Min(record.TargetId.Trim().Length, 200)],
            CorrelationId = record.CorrelationId.Trim()[..Math.Min(record.CorrelationId.Trim().Length, 100)] }, metadataJson, now);
    }
}
