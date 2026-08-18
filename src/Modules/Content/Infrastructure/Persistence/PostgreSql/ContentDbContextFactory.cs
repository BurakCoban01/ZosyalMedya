using Microsoft.EntityFrameworkCore;using Microsoft.EntityFrameworkCore.Design;
namespace ZosyalMedya.Modules.Content.Infrastructure.Persistence.PostgreSql;
public sealed class ContentDbContextFactory : IDesignTimeDbContextFactory<ContentDbContext>
{
    public ContentDbContext CreateDbContext(string[] args){var connection=Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES")??"Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";return new(new DbContextOptionsBuilder<ContentDbContext>().UseNpgsql(connection).Options);}
}
