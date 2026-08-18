using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.Notifications.Infrastructure.Persistence.PostgreSql;

public sealed class NotificationsDbContextFactory : IDesignTimeDbContextFactory<NotificationsDbContext>
{
    public NotificationsDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<NotificationsDbContext>().UseNpgsql(
            Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES") ??
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me").Options);
}
