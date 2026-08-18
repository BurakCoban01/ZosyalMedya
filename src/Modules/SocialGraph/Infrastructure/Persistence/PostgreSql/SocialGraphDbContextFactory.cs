using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.SocialGraph.Infrastructure.Persistence.PostgreSql;

public sealed class SocialGraphDbContextFactory : IDesignTimeDbContextFactory<SocialGraphDbContext>
{
    public SocialGraphDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("Modules__SocialGraph__Persistence__PostgreSqlConnectionString")
            ?? "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        var builder = new DbContextOptionsBuilder<SocialGraphDbContext>();
        builder.UseNpgsql(connection, options => options.MigrationsHistoryTable("__migrations", "social_graph"));
        return new SocialGraphDbContext(builder.Options);
    }
}
