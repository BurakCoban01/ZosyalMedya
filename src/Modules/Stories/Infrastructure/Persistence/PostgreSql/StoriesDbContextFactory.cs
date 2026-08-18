using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.Stories.Infrastructure.Persistence.PostgreSql;

public sealed class StoriesDbContextFactory : IDesignTimeDbContextFactory<StoriesDbContext>
{
    public StoriesDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES") ??
            "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        return new(new DbContextOptionsBuilder<StoriesDbContext>().UseNpgsql(connection).Options);
    }
}
