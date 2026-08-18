using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Runtime.CompilerServices;
using ZosyalMedya.BuildingBlocks.Domain;

namespace ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;

public sealed class OutboxMessage
{
    private OutboxMessage() { Type = Payload = CorrelationId = LastError = string.Empty; }
    public OutboxMessage(Guid id, string type, string payload, string correlationId, DateTimeOffset occurredAtUtc, DateTimeOffset createdAtUtc)
    { Id=id;Type=type;Payload=payload;CorrelationId=correlationId;OccurredAtUtc=occurredAtUtc;CreatedAtUtc=createdAtUtc;NextAttemptAtUtc=createdAtUtc;LastError=string.Empty; }
    public Guid Id{get;private set;}public string Type{get;private set;}public string Payload{get;private set;}public string CorrelationId{get;private set;}
    public DateTimeOffset OccurredAtUtc{get;private set;}public DateTimeOffset CreatedAtUtc{get;private set;}public DateTimeOffset NextAttemptAtUtc{get;private set;}
    public DateTimeOffset?ProcessedAtUtc{get;private set;}public DateTimeOffset?DeadLetteredAtUtc{get;private set;}public int Attempts{get;private set;}public string LastError{get;private set;}
    public string? LockedBy{get;private set;}public DateTimeOffset?LockedUntilUtc{get;private set;}
    public void Delivered(DateTimeOffset now){ProcessedAtUtc=now;LastError=string.Empty;LockedBy=null;LockedUntilUtc=null;}
    public void Failed(string error,DateTimeOffset now,int maxAttempts){Attempts++;LastError=error[..Math.Min(error.Length,2000)];LockedBy=null;LockedUntilUtc=null;if(Attempts>=maxAttempts){DeadLetteredAtUtc=now;}else{NextAttemptAtUtc=now.AddSeconds(Math.Min(300,Math.Pow(2,Attempts)));}}
}

public sealed class InboxReceipt
{
    private InboxReceipt(){Handler=string.Empty;}public InboxReceipt(Guid messageId,string handler,DateTimeOffset processedAtUtc){MessageId=messageId;Handler=handler;ProcessedAtUtc=processedAtUtc;}
    public Guid MessageId{get;private set;}public string Handler{get;private set;}public DateTimeOffset ProcessedAtUtc{get;private set;}
}

public sealed record IntegrationEventEnvelope(Guid MessageId,string Type,string Payload,string CorrelationId,DateTimeOffset OccurredAtUtc);
public interface IIntegrationEventConsumer
{
    string EventType { get; }
    Task HandleAsync(IntegrationEventEnvelope envelope,CancellationToken cancellationToken=default);
}

public static class OutboxModelBuilderExtensions
{
    public static void AddTransactionalOutbox(this ModelBuilder modelBuilder,bool ownsMigrations=false)
    {
        var outbox=modelBuilder.Entity<OutboxMessage>();outbox.ToTable("outbox","integration",table=>table.ExcludeFromMigrations(!ownsMigrations));outbox.HasKey(x=>x.Id);
        outbox.Property(x=>x.Type).HasMaxLength(500);outbox.Property(x=>x.Payload).HasColumnType("jsonb");outbox.Property(x=>x.CorrelationId).HasMaxLength(100);outbox.Property(x=>x.LastError).HasMaxLength(2000);outbox.Property(x=>x.LockedBy).HasMaxLength(100);
        outbox.HasIndex(x=>new{x.ProcessedAtUtc,x.DeadLetteredAtUtc,x.NextAttemptAtUtc,x.LockedUntilUtc});
    }
}

public sealed class OutboxSaveChangesInterceptor(TimeProvider timeProvider):SaveChangesInterceptor
{
    private readonly ConditionalWeakTable<DbContext,List<IAggregateRoot>> pendingAggregates=new();
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,InterceptionResult<int> result,CancellationToken cancellationToken=default)
    {
        var context=eventData.Context;if(context is null||context.Model.FindEntityType(typeof(OutboxMessage)) is null)return base.SavingChangesAsync(eventData,result,cancellationToken);
        if(pendingAggregates.TryGetValue(context,out _))return base.SavingChangesAsync(eventData,result,cancellationToken);
        var aggregates=context.ChangeTracker.Entries().Where(x=>x.Entity is IAggregateRoot aggregate&&aggregate.DomainEvents.Count>0).Select(x=>(IAggregateRoot)x.Entity).ToArray();
        var now=timeProvider.GetUtcNow();var correlation=Activity.Current?.TraceId.ToString()??Guid.NewGuid().ToString("N");
        foreach(var aggregate in aggregates)
        {
            foreach(var domainEvent in aggregate.DomainEvents)
            {
                var type=domainEvent.GetType();context.Set<OutboxMessage>().Add(new(Guid.NewGuid(),$"{type.FullName}:v1",JsonSerializer.Serialize(domainEvent,type),correlation,domainEvent.OccurredAtUtc,now));
            }
        }
        if(aggregates.Length>0)pendingAggregates.Add(context,aggregates.ToList());
        return base.SavingChangesAsync(eventData,result,cancellationToken);
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData,int result,CancellationToken cancellationToken=default)
    {
        if(eventData.Context is{}context&&pendingAggregates.TryGetValue(context,out var aggregates))
        {foreach(var aggregate in aggregates)aggregate.ClearDomainEvents();pendingAggregates.Remove(context);}
        return base.SavedChangesAsync(eventData,result,cancellationToken);
    }
}

public sealed class OutboxDbContext(DbContextOptions<OutboxDbContext>options):DbContext(options)
{
    public DbSet<OutboxMessage>Messages=>Set<OutboxMessage>();public DbSet<InboxReceipt>Inbox=>Set<InboxReceipt>();
    protected override void OnModelCreating(ModelBuilder modelBuilder){modelBuilder.AddTransactionalOutbox(true);var inbox=modelBuilder.Entity<InboxReceipt>();inbox.ToTable("inbox","integration");inbox.HasKey(x=>new{x.MessageId,x.Handler});inbox.Property(x=>x.Handler).HasMaxLength(500);inbox.HasIndex(x=>x.ProcessedAtUtc);}
}

public sealed class OutboxOptions
{
    public const string SectionName="Integration:Outbox";public string PostgreSqlConnectionString{get;init;}=string.Empty;public int PollSeconds{get;init;}=2;public int BatchSize{get;init;}=50;public int MaxAttempts{get;init;}=10;public int LeaseSeconds{get;init;}=60;
}

public static class OutboxDependencyInjection
{
    public static IServiceCollection AddOutboxInfrastructure(this IServiceCollection services,IConfiguration configuration)
    {
        services.AddSingleton<OutboxSaveChangesInterceptor>();services.AddOptions<OutboxOptions>().Bind(configuration.GetSection(OutboxOptions.SectionName)).Validate(x=>!string.IsNullOrWhiteSpace(x.PostgreSqlConnectionString),"Outbox connection is required.").ValidateOnStart();
        var options=configuration.GetSection(OutboxOptions.SectionName).Get<OutboxOptions>()??throw new InvalidOperationException("Outbox configuration missing.");
        services.AddDbContext<OutboxDbContext>(x=>x.UseNpgsql(options.PostgreSqlConnectionString));services.AddHostedService<OutboxInitializer>();services.AddHostedService<OutboxDeliveryWorker>();return services;
    }
}

internal sealed class OutboxInitializer(IServiceProvider provider):IHostedService
{public async Task StartAsync(CancellationToken token){await using var scope=provider.CreateAsyncScope();await scope.ServiceProvider.GetRequiredService<OutboxDbContext>().Database.MigrateAsync(token);}public Task StopAsync(CancellationToken token)=>Task.CompletedTask;}

internal sealed class OutboxDeliveryWorker(IServiceProvider provider,Microsoft.Extensions.Options.IOptions<OutboxOptions>options,TimeProvider timeProvider,ILogger<OutboxDeliveryWorker>logger):BackgroundService
{
    private readonly string workerId=$"{Environment.MachineName}:{Environment.ProcessId}:{Guid.NewGuid():N}";
    private static readonly Action<ILogger,Exception?> LogCycleFailed=LoggerMessage.Define(LogLevel.Error,new EventId(4101,"OutboxCycleFailed"),"Outbox delivery cycle failed");
    private static readonly Action<ILogger,Guid,Exception?> LogMessageFailed=LoggerMessage.Define<Guid>(LogLevel.Warning,new EventId(4102,"OutboxMessageFailed"),"Outbox message {MessageId} delivery failed");
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(Math.Clamp(options.Value.PollSeconds,1,60)));
        while(!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await DeliverAsync(stoppingToken);
                if(!await timer.WaitForNextTickAsync(stoppingToken))break;
            }
            catch(OperationCanceledException)when(stoppingToken.IsCancellationRequested){break;}
            catch(Exception exception){LogCycleFailed(logger,exception);}
        }
    }
    private async Task DeliverAsync(CancellationToken token)
    {
        await using var scope=provider.CreateAsyncScope();var db=scope.ServiceProvider.GetRequiredService<OutboxDbContext>();var now=timeProvider.GetUtcNow();
        var messages=await ClaimAsync(db,now,token);
        var handlers=scope.ServiceProvider.GetServices<IIntegrationEventConsumer>().ToArray();
        foreach(var message in messages)
        {
            try
            {
                foreach(var handler in handlers.Where(x=>x.EventType==message.Type))
                {
                    var name=handler.GetType().FullName??handler.GetType().Name;if(await db.Inbox.AnyAsync(x=>x.MessageId==message.Id&&x.Handler==name,token))continue;
                    await handler.HandleAsync(new(message.Id,message.Type,message.Payload,message.CorrelationId,message.OccurredAtUtc),token);db.Inbox.Add(new(message.Id,name,now));await db.SaveChangesAsync(token);
                }
                message.Delivered(now);
            }
            catch(Exception exception){message.Failed(exception.Message,now,Math.Clamp(options.Value.MaxAttempts,1,100));LogMessageFailed(logger,message.Id,exception);}
            await db.SaveChangesAsync(token);
        }
    }

    private async Task<IReadOnlyList<OutboxMessage>> ClaimAsync(OutboxDbContext db,DateTimeOffset now,CancellationToken token)
    {
        var connection=(NpgsqlConnection)db.Database.GetDbConnection();
        if(connection.State!=System.Data.ConnectionState.Open)await connection.OpenAsync(token);
        await using var command=connection.CreateCommand();
        command.CommandText="""
            UPDATE integration.outbox AS target
            SET "LockedBy" = @worker, "LockedUntilUtc" = @lease
            WHERE target."Id" IN (
                SELECT candidate."Id" FROM integration.outbox AS candidate
                WHERE candidate."ProcessedAtUtc" IS NULL AND candidate."DeadLetteredAtUtc" IS NULL
                  AND candidate."NextAttemptAtUtc" <= @now
                  AND (candidate."LockedUntilUtc" IS NULL OR candidate."LockedUntilUtc" <= @now)
                ORDER BY candidate."CreatedAtUtc", candidate."Id"
                FOR UPDATE SKIP LOCKED LIMIT @batch)
            RETURNING target."Id";
            """;
        command.Parameters.AddWithValue("worker",workerId);
        command.Parameters.AddWithValue("lease",now.AddSeconds(Math.Clamp(options.Value.LeaseSeconds,10,600)));
        command.Parameters.AddWithValue("now",now);
        command.Parameters.AddWithValue("batch",Math.Clamp(options.Value.BatchSize,1,500));
        var ids=new List<Guid>();
        await using(var reader=await command.ExecuteReaderAsync(token))while(await reader.ReadAsync(token))ids.Add(reader.GetGuid(0));
        if(ids.Count==0)return [];
        return await db.Messages.Where(x=>ids.Contains(x.Id)&&x.LockedBy==workerId).OrderBy(x=>x.CreatedAtUtc).ThenBy(x=>x.Id).ToListAsync(token);
    }
}
