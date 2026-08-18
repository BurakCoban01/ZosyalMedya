using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.Modules.Audit.Contracts;
using ZosyalMedya.Modules.Audit.Domain.Entries;
using Xunit;

namespace ZosyalMedya.Tests.Unit.Audit;

public sealed class AuditDomainTests
{
    [Fact]
    public void SensitiveMetadataKeysAreRejected()
    {
        var record = new AuditRecord(Guid.NewGuid(), "identity.role.changed", "User", Guid.NewGuid().ToString(),
            AuditSeverity.Warning, new Dictionary<string, string> { ["accessToken"] = "must-not-enter-audit" }, "trace");
        Assert.Throws<DomainRuleException>(() => AuditEntry.Create(AuditEntryId.New(), record, "{}", DateTimeOffset.UtcNow));
    }
}
