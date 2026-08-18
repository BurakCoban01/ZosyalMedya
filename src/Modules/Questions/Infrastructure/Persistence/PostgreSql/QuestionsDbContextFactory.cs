using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ZosyalMedya.Modules.Questions.Infrastructure.Persistence.PostgreSql;
public sealed class QuestionsDbContextFactory : IDesignTimeDbContextFactory<QuestionsDbContext>
{
    public QuestionsDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ZOSYAL_POSTGRES") ?? "Host=localhost;Port=55432;Database=zosyalmedya;Username=zosyalmedya;Password=local_only_change_me";
        return new QuestionsDbContext(new DbContextOptionsBuilder<QuestionsDbContext>().UseNpgsql(connection).Options);
    }
}
