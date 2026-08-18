using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.Modules.Profiles.Application.Ports;
using ZosyalMedya.Modules.Profiles.Application.Profiles;
using ZosyalMedya.Modules.Profiles.Contracts;
using ZosyalMedya.Modules.Profiles.Infrastructure.Configuration;
using ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Profiles.Infrastructure.Persistence.PostgreSql;

namespace ZosyalMedya.Modules.Profiles.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddProfilesModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ProfilesPersistenceOptions>().Bind(configuration.GetSection(ProfilesPersistenceOptions.SectionName)).ValidateDataAnnotations().ValidateOnStart();
        var options = configuration.GetSection(ProfilesPersistenceOptions.SectionName).Get<ProfilesPersistenceOptions>()
            ?? throw new InvalidOperationException("Profiles persistence configuration is missing.");
        if (options.Provider == ProfilesPersistenceProvider.PostgreSql)
        {
            services.AddDbContext<ProfilesDbContext>(builder => builder.UseNpgsql(options.PostgreSqlConnectionString));
            services.AddScoped<IProfileRepository, PostgreSqlProfileRepository>();
        }
        else
        {
            services.AddSingleton(_ => new ProfilesMongoDatabase(new MongoClient(options.MongoConnectionString).GetDatabase(options.MongoDatabaseName)));
            services.AddScoped(sp => new MongoProfileRepository(sp.GetRequiredService<ProfilesMongoDatabase>().Database));
            services.AddScoped<IProfileRepository>(sp => sp.GetRequiredService<MongoProfileRepository>());
        }
        services.AddScoped<UpdateMyProfileHandler>();
        services.AddScoped<GetProfileHandler>();
        services.AddScoped<IProfilesModule, ProfilesModule>();
        services.AddHostedService<ProfilesPersistenceInitializer>();
        return services;
    }
}

internal sealed record ProfilesMongoDatabase(IMongoDatabase Database);

internal sealed class ProfilesPersistenceInitializer(IServiceProvider provider, IOptions<ProfilesPersistenceOptions> options) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = provider.CreateAsyncScope();
        if (options.Value.Provider == ProfilesPersistenceProvider.PostgreSql)
            await scope.ServiceProvider.GetRequiredService<ProfilesDbContext>().Database.MigrateAsync(cancellationToken);
        else
            await scope.ServiceProvider.GetRequiredService<MongoProfileRepository>().EnsureIndexesAsync(cancellationToken);
    }
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
