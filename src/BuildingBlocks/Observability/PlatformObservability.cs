using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace ZosyalMedya.BuildingBlocks.Observability;

public static class PlatformTelemetry
{
    public const string ServiceName="EnterpriseSocialCommunityPlatform.Api";
    public static readonly ActivitySource ActivitySource=new(ServiceName);
    public static readonly Meter Meter=new(ServiceName);
    public static readonly Counter<long> ModerationActions=Meter.CreateCounter<long>("escp.moderation.actions");
    public static readonly Histogram<double> FeedGenerationMilliseconds=Meter.CreateHistogram<double>("escp.feed.generation.duration","ms");
}

public static class ObservabilityDependencyInjection
{
    public static IServiceCollection AddPlatformObservability(this IServiceCollection services,IConfiguration configuration)
    {
        var otlpEndpoint=configuration["Observability:OtlpEndpoint"];
        var builder=services.AddOpenTelemetry().ConfigureResource(resource=>resource.AddService(PlatformTelemetry.ServiceName,
            serviceVersion:typeof(PlatformTelemetry).Assembly.GetName().Version?.ToString()??"0.0.0"))
            .WithTracing(tracing=>
            {
                tracing.AddSource(PlatformTelemetry.ServiceName).AddAspNetCoreInstrumentation(options=>
                {
                    options.RecordException=true;
                    options.Filter=context=>!context.Request.Path.StartsWithSegments("/health/live");
                    options.EnrichWithHttpRequest=SensitiveTelemetryRedaction.RedactHubQuery;
                })
                .AddHttpClientInstrumentation(options=>options.RecordException=true);
                if(Uri.TryCreate(otlpEndpoint,UriKind.Absolute,out var endpoint))tracing.AddOtlpExporter(options=>options.Endpoint=endpoint);
            })
            .WithMetrics(metrics=>
            {
                metrics.AddMeter(PlatformTelemetry.ServiceName).AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation();
                if(Uri.TryCreate(otlpEndpoint,UriKind.Absolute,out var endpoint))metrics.AddOtlpExporter(options=>options.Endpoint=endpoint);
            });
        return services;
    }
}

public static class SensitiveTelemetryRedaction
{
    public static void RedactHubQuery(Activity activity,Microsoft.AspNetCore.Http.HttpRequest request)
    {
        if(!request.Path.StartsWithSegments("/hubs"))return;
        activity.SetTag("url.query","[REDACTED]");
        activity.SetTag("http.target",request.Path.Value);
    }
}
