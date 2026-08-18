using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;

public sealed class IdentityDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("Modules__Identity__Persistence__PostgreSqlConnectionString")
            ?? "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        var builder = new DbContextOptionsBuilder<IdentityDbContext>();
        builder.UseNpgsql(connection, options => options.MigrationsHistoryTable("__migrations", "identity"));
        return new IdentityDbContext(builder.Options);
    }
}
