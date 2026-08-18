using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

public sealed class OutboxDbContextFactory : IDesignTimeDbContextFactory<OutboxDbContext>
{
    public OutboxDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES") ??
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        return new OutboxDbContext(new DbContextOptionsBuilder<OutboxDbContext>().UseNpgsql(connection).Options);
    }
}
