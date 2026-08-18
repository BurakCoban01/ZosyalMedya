using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Application.Users.Login;
using ZosyalMedya.Modules.Identity.Application.Users.Register;
using ZosyalMedya.Modules.Identity.Application.Users.Administration;
using ZosyalMedya.Modules.Identity.Application.Sessions.Refresh;
using ZosyalMedya.Modules.Identity.Application.Sessions.Manage;
using ZosyalMedya.Modules.Identity.Application.Security;
using ZosyalMedya.Modules.Identity.Application.Privacy;
using ZosyalMedya.Modules.Identity.Infrastructure.Configuration;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.MongoDb;
using ZosyalMedya.Modules.Identity.Infrastructure.Persistence.PostgreSql;
using ZosyalMedya.Modules.Identity.Infrastructure.Security;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

namespace ZosyalMedya.Modules.Identity.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<IdentityPersistenceOptions>()
            .Bind(configuration.GetSection(IdentityPersistenceOptions.SectionName))
            .ValidateDataAnnotations().ValidateOnStart();
        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations().ValidateOnStart();
        services.AddOptions<IdentityBootstrapOptions>()
            .Bind(configuration.GetSection(IdentityBootstrapOptions.SectionName))
            .Validate(options => options.IsValid, "Enabled administrator bootstrap requires username, email and a 12+ character password.")
            .ValidateOnStart();
        services.AddOptions<IdentityDeliveryOptions>()
            .Bind(configuration.GetSection(IdentityDeliveryOptions.SectionName))
            .ValidateDataAnnotations().ValidateOnStart();

        var persistence = configuration.GetSection(IdentityPersistenceOptions.SectionName).Get<IdentityPersistenceOptions>()
            ?? throw new InvalidOperationException("Identity persistence configuration is missing.");
        if (persistence.Provider == PersistenceProvider.PostgreSql)
        {
            services.AddDbContext<IdentityDbContext>((provider, options) => options.UseNpgsql(persistence.PostgreSqlConnectionString)
                .AddInterceptors(provider.GetRequiredService<OutboxSaveChangesInterceptor>()));
            services.AddScoped<IUserAccountRepository, PostgreSqlUserAccountRepository>();
            services.AddScoped<IUserSessionRepository, PostgreSqlUserSessionRepository>();
            services.AddScoped<ISecurityChallengeRepository, PostgreSqlSecurityChallengeRepository>();
        }
        else
        {
            services.AddSingleton<IMongoClient>(_ => new MongoClient(persistence.MongoConnectionString));
            services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(persistence.MongoDatabaseName));
            services.AddScoped<MongoUserAccountRepository>();
            services.AddScoped<IUserAccountRepository>(sp => sp.GetRequiredService<MongoUserAccountRepository>());
            services.AddScoped<MongoUserSessionRepository>();
            services.AddScoped<IUserSessionRepository>(sp => sp.GetRequiredService<MongoUserSessionRepository>());
            services.AddScoped<MongoSecurityChallengeRepository>();
            services.AddScoped<ISecurityChallengeRepository>(sp => sp.GetRequiredService<MongoSecurityChallengeRepository>());
        }

        services.AddSingleton<IPasswordHasher, AdaptivePasswordHasher>();
        services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
        services.AddSingleton<IRefreshTokenProtector, RefreshTokenProtector>();
        services.AddSingleton<ISecurityTokenProtector, RefreshTokenProtector>();
        var publicDemoEnabled = configuration.GetValue<bool>("PUBLIC_DEMO_MODE");
        var visitorEmailDomain = configuration["PublicDemo:VisitorEmailDomain"] ?? "visitor.escp.test";
        services.AddSingleton(new ConfiguredPublicDemoIdentityPolicy(publicDemoEnabled, visitorEmailDomain));
        services.AddSingleton<IPublicDemoIdentityPolicy>(provider => provider.GetRequiredService<ConfiguredPublicDemoIdentityPolicy>());
        services.AddSingleton<PublicDemoIdentityMailbox>();
        if (publicDemoEnabled)
        {
            services.AddSingleton<IIdentityMessageSender>(provider => provider.GetRequiredService<PublicDemoIdentityMailbox>());
            services.AddSingleton<IHostedService>(provider => provider.GetRequiredService<PublicDemoIdentityMailbox>());
        }
        else services.AddSingleton<IIdentityMessageSender, LocalIdentityMessageSender>();
        services.AddSingleton<IMfaSecurityService, MfaSecurityService>();
        services.AddScoped<IdentitySecurityFlows>();
        services.AddScoped<MfaFlows>();
        services.AddScoped<RegisterUserHandler>();
        services.AddScoped<LoginUserHandler>();
        services.AddScoped<RefreshSessionHandler>();
        services.AddScoped<ListSessionsHandler>();
        services.AddScoped<RevokeSessionHandler>();
        services.AddScoped<LogoutSessionHandler>();
        services.AddScoped<ManageAccountsHandler>();
        services.AddScoped<ExportMyIdentityDataHandler>();
        services.AddScoped<DeleteMyIdentityDataHandler>();
        services.AddHostedService<IdentityPersistenceInitializer>();
        return services;
    }
}

internal sealed class IdentityPersistenceInitializer(
    IServiceProvider serviceProvider,
    IOptions<IdentityPersistenceOptions> options,
    IOptions<IdentityBootstrapOptions> bootstrapOptions,
    IClock clock) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = serviceProvider.CreateAsyncScope();
        if (options.Value.Provider == PersistenceProvider.PostgreSql)
        {
            var context = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            await context.Database.MigrateAsync(cancellationToken);
        }
        else
        {
            var repository = scope.ServiceProvider.GetRequiredService<MongoUserAccountRepository>();
            await repository.EnsureIndexesAsync(cancellationToken);
            var sessions = scope.ServiceProvider.GetRequiredService<MongoUserSessionRepository>();
            await sessions.EnsureIndexesAsync(cancellationToken);
            var challenges = scope.ServiceProvider.GetRequiredService<MongoSecurityChallengeRepository>();
            await challenges.EnsureIndexesAsync(cancellationToken);
        }
        await BootstrapAdministratorAsync(scope.ServiceProvider, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task BootstrapAdministratorAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        var bootstrap = bootstrapOptions.Value;
        if (!bootstrap.Enabled) return;
        var repository = services.GetRequiredService<IUserAccountRepository>();
        var normalizedEmail = bootstrap.Email.Trim().ToUpperInvariant();
        var account = await repository.SelectAsync(x => x.NormalizedEmail == normalizedEmail, cancellationToken);
        if (account is null)
        {
            var hasher = services.GetRequiredService<IPasswordHasher>();
            account = Domain.Users.UserAccount.Register(Domain.Users.UserId.New(), bootstrap.Username, bootstrap.Email,
                hasher.Hash(bootstrap.Password), clock.UtcNow);
            account.VerifyEmail(clock.UtcNow);
            account.SetRole(Domain.Users.AccountRole.Administrator, true, clock.UtcNow);
            await repository.CreateAsync(account, cancellationToken);
            return;
        }
        if (account.HasRole(Domain.Users.AccountRole.Administrator)) return;
        var version = account.Version;
        account.SetRole(Domain.Users.AccountRole.Administrator, true, clock.UtcNow);
        if (!await repository.UpdateAsync(x => x.Id == account.Id, account, version, cancellationToken))
            throw new InvalidOperationException("Administrator bootstrap encountered a concurrency conflict.");
    }
}
