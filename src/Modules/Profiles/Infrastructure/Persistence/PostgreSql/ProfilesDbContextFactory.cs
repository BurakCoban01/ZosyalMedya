using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.PostgreSql;

public sealed class ProfilesDbContextFactory : IDesignTimeDbContextFactory<ProfilesDbContext>
{
    public ProfilesDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("Modules__Profiles__Persistence__PostgreSqlConnectionString")
            ?? "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        var builder = new DbContextOptionsBuilder<ProfilesDbContext>();
        builder.UseNpgsql(connection, options => options.MigrationsHistoryTable("__migrations", "profiles"));
        return new ProfilesDbContext(builder.Options);
    }
}
