using System.Text;
using System.ComponentModel.DataAnnotations;
using System.Threading.RateLimiting;
using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ZosyalMedya.BuildingBlocks.Domain;
using ZosyalMedya.BuildingBlocks.Infrastructure.Redis;
using ZosyalMedya.BuildingBlocks.Infrastructure.Outbox;
using ZosyalMedya.BuildingBlocks.Infrastructure.Deployment;
using ZosyalMedya.BuildingBlocks.Observability;
using ZosyalMedya.Host.Api;
using ZosyalMedya.Modules.Identity.Application.Users.Login;
using ZosyalMedya.Modules.Identity.Application.Users.Register;
using ZosyalMedya.Modules.Identity.Infrastructure;
using ZosyalMedya.Modules.Identity.Infrastructure.Security;
using ZosyalMedya.Modules.Identity.Application.Sessions.Refresh;
using ZosyalMedya.Modules.Identity.Application.Sessions.Manage;
using ZosyalMedya.Modules.Identity.Application.Users.Administration;
using ZosyalMedya.Modules.Identity.Application.Security;
using ZosyalMedya.Modules.Identity.Application.Privacy;
using ZosyalMedya.Modules.Identity.Application.Ports;
using ZosyalMedya.Modules.Identity.Domain.Sessions;
using ZosyalMedya.Modules.Identity.Domain.Users;
using ZosyalMedya.Modules.Profiles.Application.Profiles;
using ZosyalMedya.Modules.Profiles.Domain.Profiles;
using ZosyalMedya.Modules.Profiles.Infrastructure;
using ZosyalMedya.Modules.SocialGraph.Application.Relationships;
using ZosyalMedya.Modules.SocialGraph.Domain.Relationships;
using ZosyalMedya.Modules.SocialGraph.Infrastructure;
using ZosyalMedya.Modules.Questions.Application.Questions;
using ZosyalMedya.Modules.Questions.Domain.Questions;
using ZosyalMedya.Modules.Questions.Infrastructure;
using ZosyalMedya.Modules.Content.Application.Posts;
using ZosyalMedya.Modules.Content.Application.Polls;
using ZosyalMedya.Modules.Content.Application.Saved;
using ZosyalMedya.Modules.Content.Application.Impressions;
using ZosyalMedya.Modules.Content.Domain.Posts;
using ZosyalMedya.Modules.Content.Infrastructure;
using ZosyalMedya.Modules.Reactions.Application.Reactions;
using ZosyalMedya.Modules.Reactions.Infrastructure;
using ZosyalMedya.Modules.Reactions.Contracts;
using ZosyalMedya.Modules.Comments.Application.Comments;
using ZosyalMedya.Modules.Comments.Infrastructure;
using ZosyalMedya.Modules.Feed.Application.Feeds;
using ZosyalMedya.Modules.Feed.Infrastructure;
using ZosyalMedya.Modules.Messaging.Infrastructure;
using ZosyalMedya.Modules.Messaging.Application.Conversations;
using ZosyalMedya.Modules.Messaging.Application.Ports;
using ZosyalMedya.Modules.Notifications.Infrastructure;
using ZosyalMedya.Modules.Notifications.Application.Inbox;
using ZosyalMedya.Modules.Notifications.Application.Ports;
using ZosyalMedya.Modules.Communities.Infrastructure;
using ZosyalMedya.Modules.Communities.Application.Communities;
using ZosyalMedya.Modules.Communities.Domain.Communities;
using ZosyalMedya.Modules.Media.Infrastructure;
using ZosyalMedya.Modules.Media.Application.Assets;
using ZosyalMedya.Modules.Media.Domain.Assets;
using ZosyalMedya.Modules.Stories.Application.Stories;
using ZosyalMedya.Modules.Stories.Infrastructure;
using ZosyalMedya.Modules.Search.Infrastructure;
using ZosyalMedya.Modules.Search.Application.Search;
using ZosyalMedya.Modules.Search.Contracts;
using ZosyalMedya.Modules.Audit.Infrastructure;
using ZosyalMedya.Modules.Audit.Application.Audit;
using ZosyalMedya.Modules.Moderation.Infrastructure;
using ZosyalMedya.Modules.Moderation.Application.Cases;
using ZosyalMedya.Modules.Moderation.Contracts;
using ZosyalMedya.Modules.Moderation.Domain.Cases;
using ZosyalMedya.Modules.Administration.Infrastructure;
using ZosyalMedya.Modules.Administration.Application.Configuration;

var builder = WebApplication.CreateBuilder(args);
var runtimeConfiguration = ApiRuntimeConfiguration.Load(
    builder.Configuration,
    builder.Environment.IsDevelopment(),
    builder.Environment.ContentRootPath);
var publicDemoEnabled = builder.Configuration.GetValue<bool>("PUBLIC_DEMO_MODE");
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 100L * 1024 * 1024;
    if (publicDemoEnabled)
        options.Limits.MinRequestBodyDataRate = new(256 * 1024, TimeSpan.FromSeconds(10));
});
builder.Logging.ClearProviders();
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.Logging.AddJsonConsole(options=>{options.IncludeScopes=true;options.TimestampFormat="yyyy-MM-dd'T'HH:mm:ss.fffK";});
builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHealthChecks();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDataProtection()
    // Persisted MFA secrets and enrollment tokens depend on this historical
    // Data Protection discriminator. It is an internal compatibility value,
    // not public product copy.
    .SetApplicationName("ZosyalMedya")
    .PersistKeysToFileSystem(new DirectoryInfo(runtimeConfiguration.DataProtectionKeysPath));
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddPlatformObservability(builder.Configuration);
builder.Services.AddOutboxInfrastructure(builder.Configuration);
builder.Services.AddIdentityModule(builder.Configuration);
builder.Services.AddProfilesModule(builder.Configuration);
builder.Services.AddSocialGraphModule(builder.Configuration);
builder.Services.AddQuestionsModule(builder.Configuration);
builder.Services.AddContentModule(builder.Configuration);
builder.Services.AddReactionsModule(builder.Configuration);
builder.Services.AddCommentsModule(builder.Configuration);
builder.Services.AddFeedModule();
builder.Services.AddMessagingModule(builder.Configuration);
builder.Services.AddNotificationsModule(builder.Configuration);
builder.Services.AddCommunitiesModule(builder.Configuration);
builder.Services.AddMediaModule(builder.Configuration);
builder.Services.AddStoriesModule(builder.Configuration);
builder.Services.AddSearchModule(builder.Configuration);
builder.Services.AddAuditModule(builder.Configuration);
builder.Services.AddModerationModule(builder.Configuration);
builder.Services.AddAdministrationModule(builder.Configuration);
builder.Services.AddRedisInfrastructure(builder.Configuration);
builder.Services.AddSingleton<IRealtimeMessagePublisher, SignalRMessagePublisher>();
builder.Services.AddSingleton<IRealtimeNotificationPublisher, SignalRNotificationPublisher>();
builder.Services.AddSingleton(new BrowserSessionSecurity(builder.Environment.IsDevelopment(), runtimeConfiguration.AllowedOrigins));
builder.Services.AddSingleton(new MessagingRealtimeBudget(publicDemoEnabled ? 30 : 120));
if (publicDemoEnabled)
{
    var retention = builder.Configuration.GetSection(PublicDemoRetentionOptions.SectionName)
        .Get<PublicDemoRetentionOptions>() ?? new PublicDemoRetentionOptions();
    Validator.ValidateObject(retention, new ValidationContext(retention), validateAllProperties: true);
    builder.Services.AddSingleton(retention);
    builder.Services.AddHostedService<PublicDemoRetentionWorker>();
}
builder.Services.AddSignalR().AddStackExchangeRedis(runtimeConfiguration.RedisConnectionString);

var signingKey = runtimeConfiguration.JwtSigningKey;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Security:Jwt:Issuer"],
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Security:Jwt:Audience"],
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
        ValidateLifetime = true,
        RoleClaimType = "role",
        ClockSkew = TimeSpan.FromSeconds(30)
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var token = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                context.Token = token;
            return Task.CompletedTask;
        },
        OnTokenValidated = async context =>
        {
            var subject = context.Principal?.FindFirstValue("sub");
            if (!Guid.TryParse(subject, out var rawUserId))
            {
                context.Fail("Access token subject is invalid.");
                return;
            }

            var users = context.HttpContext.RequestServices.GetRequiredService<IUserAccountRepository>();
            var account = await users.SelectAsync(x => x.Id == new UserId(rawUserId),
                context.HttpContext.RequestAborted);
            if (account?.Status != AccountStatus.Active)
                context.Fail("Account is not active.");
        }
    };
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Moderation", policy => policy.RequireRole("Moderator", "Administrator"));
    options.AddPolicy("Support", policy => policy.RequireRole("Support", "Administrator"));
    options.AddPolicy("Administration", policy => policy.RequireRole("Administrator"));
});
builder.Services.AddCors(options => options.AddPolicy("clients", policy => policy
    .WithOrigins(runtimeConfiguration.AllowedOrigins)
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
    .WithHeaders("Authorization", "Content-Type", "X-Correlation-ID", "Idempotency-Key", BrowserSessionSecurity.CsrfHeaderName)));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("registration-write", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: false),
        _ => FixedWindow(publicDemoEnabled ? 3 : 10,
            publicDemoEnabled ? TimeSpan.FromHours(1) : TimeSpan.FromMinutes(1))));
    options.AddPolicy("identity-write", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: true), _ => FixedWindow(10, TimeSpan.FromMinutes(1))));
    options.AddPolicy("social-write", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: true),
        _ => FixedWindow(publicDemoEnabled ? 30 : 60, TimeSpan.FromMinutes(1))));
    options.AddPolicy("message-write", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: true),
        _ => FixedWindow(publicDemoEnabled ? 15 : 60, TimeSpan.FromMinutes(1))));
    options.AddPolicy("report-write", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: true),
        _ => FixedWindow(publicDemoEnabled ? 5 : 60,
            publicDemoEnabled ? TimeSpan.FromHours(1) : TimeSpan.FromMinutes(1))));
    options.AddPolicy("search-read", context => RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context, authenticated: true),
        _ => FixedWindow(publicDemoEnabled ? 30 : 120, TimeSpan.FromMinutes(1))));
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "Enterprise Social & Community Platform API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
});

var app = builder.Build();
app.UseExceptionHandler();
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    ForwardLimit = 1
};
forwardedHeaders.KnownNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
foreach (var proxy in runtimeConfiguration.TrustedProxies)
    forwardedHeaders.KnownProxies.Add(proxy);
app.UseForwardedHeaders(forwardedHeaders);
app.Use(async (context, next) =>
{
    const string header = "X-Correlation-ID";
    var correlationId = context.Request.Headers[header].FirstOrDefault() ?? Guid.NewGuid().ToString("N");
    context.TraceIdentifier = correlationId;
    context.Response.Headers[header] = correlationId;
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});
app.UseCors("clients");
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method) ||
        context.Request.Path.StartsWithSegments("/api/v1/moderation") ||
        !TryGetUserId(context.User, out var userId)) { await next(); return; }
    var path = context.Request.Path;
    var capability = path.StartsWithSegments("/api/v1/messaging") ? ModerationCapability.Message
        : path.StartsWithSegments("/api/v1/communities") ? ModerationCapability.CreateCommunity
        : path.Value?.Contains("/reaction", StringComparison.OrdinalIgnoreCase) == true ||
          path.Value?.Contains("/comments", StringComparison.OrdinalIgnoreCase) == true ? ModerationCapability.Engage
        : ModerationCapability.Publish;
    var moderation = context.RequestServices.GetRequiredService<IModerationModule>();
    if (!await moderation.CanPerformAsync(userId.Value, capability, context.RequestAborted))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { title = "İşlem kısıtlandı", code = "moderation.restricted" }, context.RequestAborted);
        return;
    }
    await next();
});
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health/live", () => Results.Ok(new { status = "live" })).ExcludeFromDescription();
app.MapHealthChecks("/health/ready");
app.MapGet("/api/v1/system/version", () => Results.Ok(new { version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0" }));
app.MapGet("/api/v1/system/public-demo", (IPublicDemoIdentityPolicy policy, IConfiguration configuration) => Results.Ok(new
{
    enabled = policy.Enabled,
    visitorEmailDomain = policy.Enabled ? policy.VisitorEmailDomain : null,
    artifactRetentionHours = policy.Enabled
        ? (int?)(configuration.GetValue<int?>("PublicDemo:Retention:ArtifactHours") ?? 24)
        : null
}));

var identity = app.MapGroup("/api/v1/identity").WithTags("Identity");
identity.MapPost("/register", async (RegisterRequest request, HttpContext context, RegisterUserHandler handler,
    IPublicDemoIdentityPolicy publicDemo, PublicDemoIdentityMailbox mailbox, BrowserSessionSecurity browserSession,
    CancellationToken cancellationToken) =>
{
    var result = await handler.HandleAsync(new(request.Username, request.Email, request.Password), cancellationToken);
    if (!result.IsSuccess) return ToProblem(result.Error);
    if (publicDemo.Enabled)
    {
        BrowserSessionSecurity.PreventCaching(context.Response);
        context.Request.Cookies.TryGetValue(browserSession.DemoMailboxCookieName, out var currentCapability);
        browserSession.IssueDemoMailbox(context.Response, mailbox.Grant(result.Value!.Email, currentCapability));
    }
    return Results.Created($"/api/v1/profiles/{result.Value!.UserId}", result.Value);
}).RequireRateLimiting("registration-write");
identity.MapPost("/login", async (LoginRequest request, LoginUserHandler handler, CancellationToken cancellationToken) =>
{
    var result = await handler.HandleAsync(new(request.Login, request.Password, request.DeviceId, request.DeviceName, request.MfaCode), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("identity-write");
identity.MapPost("/browser/login", async (LoginRequest request, HttpContext context, LoginUserHandler handler,
    BrowserSessionSecurity browserSession, CancellationToken cancellationToken) =>
{
    BrowserSessionSecurity.PreventCaching(context.Response);
    if (!browserSession.IsSameOriginRequest(context.Request)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var result = await handler.HandleAsync(new(request.Login, request.Password, request.DeviceId, request.DeviceName, request.MfaCode), cancellationToken);
    if (!result.IsSuccess) return ToProblem(result.Error);
    browserSession.Issue(context.Response, result.Value!.Tokens.RefreshToken);
    return Results.Ok(new BrowserLoginResult(result.Value.UserId, result.Value.Username,
        result.Value.Tokens.AccessToken, result.Value.Tokens.AccessTokenExpiresAtUtc));
}).RequireRateLimiting("identity-write");
identity.MapPost("/mfa/enrollment", async (ClaimsPrincipal principal, MfaFlows handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var result = await handler.BeginAsync(userId, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("identity-write");
identity.MapPost("/mfa/confirmation", async (ConfirmMfaRequest request, ClaimsPrincipal principal, MfaFlows handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var result = await handler.ConfirmAsync(userId, request.EnrollmentToken, request.Code, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("identity-write");
identity.MapPost("/mfa/disable", async (MfaCodeRequest request, ClaimsPrincipal principal, MfaFlows handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var result = await handler.DisableAsync(userId, request.Code, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("identity-write");
identity.MapPost("/email-verification/request", async (EmailRequest request, IdentitySecurityFlows handler, CancellationToken token) =>
{
    await handler.SendVerificationAsync(request.Email, token);
    return Results.Accepted();
}).RequireRateLimiting("identity-write");
identity.MapPost("/email-verification/confirm", async (SecurityTokenRequest request, IdentitySecurityFlows handler, CancellationToken token) =>
{
    var result = await handler.VerifyEmailAsync(request.Token, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireRateLimiting("identity-write");
identity.MapPost("/password-reset/request", async (EmailRequest request, IdentitySecurityFlows handler, CancellationToken token) =>
{
    await handler.RequestPasswordResetAsync(request.Email, token);
    return Results.Accepted();
}).RequireRateLimiting("identity-write");
identity.MapPost("/password-reset/confirm", async (PasswordResetRequest request, IdentitySecurityFlows handler, CancellationToken token) =>
{
    var result = await handler.ResetPasswordAsync(request.Token, request.NewPassword, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireRateLimiting("identity-write");
identity.MapPost("/demo-mailbox", (EmailRequest request, HttpContext context, PublicDemoIdentityMailbox mailbox,
    BrowserSessionSecurity browserSession) =>
{
    BrowserSessionSecurity.PreventCaching(context.Response);
    if (!browserSession.IsSameOriginRequest(context.Request) ||
        !context.Request.Cookies.TryGetValue(browserSession.DemoMailboxCookieName, out var capability))
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    var messages = mailbox.Read(request.Email, capability);
    return messages is null ? Results.StatusCode(StatusCodes.Status403Forbidden) : Results.Ok(messages);
}).RequireRateLimiting("identity-write");
identity.MapPost("/refresh", async (RefreshRequest request, RefreshSessionHandler handler, CancellationToken cancellationToken) =>
{
    var result = await handler.HandleAsync(new(request.RefreshToken), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("identity-write");
identity.MapPost("/browser/refresh", async (HttpContext context, RefreshSessionHandler handler,
    BrowserSessionSecurity browserSession, CancellationToken cancellationToken) =>
{
    BrowserSessionSecurity.PreventCaching(context.Response);
    if (!browserSession.IsSameOriginRequest(context.Request) || !browserSession.HasValidCsrf(context.Request))
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (!context.Request.Cookies.TryGetValue(browserSession.RefreshCookieName, out var refreshToken))
        return Results.Unauthorized();
    var result = await handler.HandleAsync(new(refreshToken), cancellationToken);
    if (!result.IsSuccess) { browserSession.Clear(context.Response); return ToProblem(result.Error); }
    browserSession.Issue(context.Response, result.Value!.RefreshToken);
    return Results.Ok(new BrowserAccessToken(result.Value.AccessToken, result.Value.AccessTokenExpiresAtUtc));
}).RequireRateLimiting("identity-write");
identity.MapPost("/logout", async (LogoutRequest request, LogoutSessionHandler handler, CancellationToken cancellationToken) =>
{
    await handler.HandleAsync(request.RefreshToken, cancellationToken);
    return Results.NoContent();
}).RequireRateLimiting("identity-write");
identity.MapPost("/browser/logout", async (HttpContext context, LogoutSessionHandler handler,
    BrowserSessionSecurity browserSession, CancellationToken cancellationToken) =>
{
    BrowserSessionSecurity.PreventCaching(context.Response);
    if (!browserSession.IsSameOriginRequest(context.Request) || !browserSession.HasValidCsrf(context.Request))
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (context.Request.Cookies.TryGetValue(browserSession.RefreshCookieName, out var refreshToken))
        await handler.HandleAsync(refreshToken, cancellationToken);
    browserSession.Clear(context.Response);
    return Results.NoContent();
}).RequireRateLimiting("identity-write");
identity.MapGet("/sessions", async (ClaimsPrincipal principal, ListSessionsHandler handler, CancellationToken cancellationToken) =>
{
    return TryGetUserId(principal, out var userId)
        ? Results.Ok(await handler.HandleAsync(userId, cancellationToken))
        : Results.Unauthorized();
}).RequireAuthorization();
identity.MapDelete("/sessions/{sessionId:guid}", async (Guid sessionId, ClaimsPrincipal principal, RevokeSessionHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var result = await handler.HandleAsync(userId, new SessionId(sessionId), cancellationToken);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("identity-write");
identity.MapGet("/privacy/export", async (HttpContext context, ExportMyIdentityDataHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var result = await handler.HandleAsync(userId, context.TraceIdentifier, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization();
identity.MapDelete("/privacy", async ([FromBody] DeleteMyDataRequest request, HttpContext context,
    DeleteMyIdentityDataHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var userId)) return Results.Unauthorized();
    var result = await handler.HandleAsync(userId, request.CurrentPassword, request.MfaCode,
        context.TraceIdentifier, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("identity-write");

var identityAdministration = app.MapGroup("/api/v1/administration/accounts").WithTags("Administration")
    .RequireAuthorization("Administration");
identityAdministration.MapGet("/", async (int? limit, ManageAccountsHandler handler, CancellationToken token) =>
    Results.Ok(await handler.ListAsync(limit ?? 50, token)));
identityAdministration.MapPatch("/{id:guid}", async (Guid id, AccountAdministrationRequest request,
    HttpContext context, ManageAccountsHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var actor)) return Results.Unauthorized();
    var result = await handler.ChangeAsync(id, actor.Value, request.Change, request.Role, context.TraceIdentifier, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");

var profileEndpoints = app.MapGroup("/api/v1/profiles").WithTags("Profiles");
profileEndpoints.MapPut("/me", async (UpdateProfileRequest request, ClaimsPrincipal principal, UpdateMyProfileHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var command = new UpdateMyProfileCommand(new ProfileOwnerId(userId.Value), request.Handle, request.DisplayName,
        request.Biography, request.Location, request.Organization, request.WebsiteUrl, request.ProfileMediaId,
        request.CoverMediaId, request.IsPrivate, request.Theme, request.Language, request.ReduceMotion);
    var result = await handler.HandleAsync(command, cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
profileEndpoints.MapGet("/me", async (ClaimsPrincipal principal, GetProfileHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var userId)) return Results.Unauthorized();
    var result = await handler.MineAsync(new ProfileOwnerId(userId.Value), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization();
profileEndpoints.MapGet("/{handle}", async (string handle, ClaimsPrincipal principal, GetProfileHandler handler, CancellationToken cancellationToken) =>
{
    ProfileOwnerId? viewer = TryGetUserId(principal, out var userId) ? new ProfileOwnerId(userId.Value) : null;
    var result = await handler.ByHandleAsync(handle, viewer, cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
});

var graph = app.MapGroup("/api/v1/social-graph").WithTags("SocialGraph").RequireAuthorization();
graph.MapPost("/{targetId:guid}/follow", async (Guid targetId, ClaimsPrincipal principal, FollowHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new GraphUserId(actor.Value), new GraphUserId(targetId), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");
graph.MapPost("/requests/{requesterId:guid}/accept", async (Guid requesterId, ClaimsPrincipal principal, AcceptFollowHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new GraphUserId(actor.Value), new GraphUserId(requesterId), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");
graph.MapDelete("/requests/{requesterId:guid}", async (Guid requesterId, ClaimsPrincipal principal, RejectFollowHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new GraphUserId(actor.Value), new GraphUserId(requesterId), cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");
graph.MapGet("/requests/incoming", async (int? limit, string? cursor, ClaimsPrincipal principal, SocialGraphReadHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try
    {
        var result = await handler.IncomingAsync(new GraphUserId(actor.Value), limit ?? 20, cursor, token);
        return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
    }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
graph.MapGet("/{ownerId:guid}/summary", async (Guid ownerId, ClaimsPrincipal principal, SocialGraphReadHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.SummaryAsync(new GraphUserId(actor.Value), new GraphUserId(ownerId), token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
});
graph.MapGet("/{ownerId:guid}/profiles/{kind}", async (Guid ownerId, SocialGraphListKind kind, int? limit, string? cursor,
    ClaimsPrincipal principal, SocialGraphReadHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try
    {
        var result = await handler.ListAsync(new GraphUserId(actor.Value), new GraphUserId(ownerId), kind,
            limit ?? 20, cursor, token);
        return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
    }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
graph.MapDelete("/{targetId:guid}/follow", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.Unfollow, handler, token)).RequireRateLimiting("social-write");
graph.MapPut("/{targetId:guid}/block", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.Block, handler, token)).RequireRateLimiting("social-write");
graph.MapDelete("/{targetId:guid}/block", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.Unblock, handler, token)).RequireRateLimiting("social-write");
graph.MapPut("/{targetId:guid}/mute", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.Mute, handler, token)).RequireRateLimiting("social-write");
graph.MapDelete("/{targetId:guid}/mute", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.Unmute, handler, token)).RequireRateLimiting("social-write");
graph.MapPut("/{targetId:guid}/close-friend", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.AddCloseFriend, handler, token)).RequireRateLimiting("social-write");
graph.MapDelete("/{targetId:guid}/close-friend", (Guid targetId, ClaimsPrincipal principal, ChangeRelationshipHandler handler, CancellationToken token) =>
    ChangeRelationshipAsync(targetId, principal, RelationshipChange.RemoveCloseFriend, handler, token)).RequireRateLimiting("social-write");
graph.MapGet("/{targetId:guid}", async (Guid targetId, ClaimsPrincipal principal, GetRelationshipHandler handler, CancellationToken cancellationToken) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    return Results.Ok(await handler.HandleAsync(new GraphUserId(actor.Value), new GraphUserId(targetId), cancellationToken));
});

var questionEndpoints = app.MapGroup("/api/v1/questions").WithTags("Questions").RequireAuthorization();
questionEndpoints.MapPost("/", async (AskQuestionRequest request, ClaimsPrincipal principal, AskQuestionHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new(new QuestionUserId(actor.Value), new QuestionUserId(request.TargetId), request.Body,
        request.IsAnonymous, request.Audience, request.IsDraft, request.PublishAtUtc), token);
    return result.IsSuccess ? Results.Created($"/api/v1/questions/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");
questionEndpoints.MapGet("/inbox", async (QuestionStatus? status, int? limit, ClaimsPrincipal principal, QuestionInboxHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    return Results.Ok(await handler.HandleAsync(new QuestionUserId(actor.Value), status, limit ?? 50, token));
});
questionEndpoints.MapGet("/by-profile/{targetId:guid}", async (Guid targetId, int? limit, ClaimsPrincipal principal,
    ListProfileQuestionsHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? new QuestionUserId(actor.Value) : (QuestionUserId?)null;
    var result = await handler.HandleAsync(new QuestionUserId(targetId), viewer, limit ?? 6, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).AllowAnonymous();
questionEndpoints.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, GetQuestionHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? new QuestionUserId(actor.Value) : (QuestionUserId?)null;
    var result = await handler.HandleAsync(new QuestionId(id), viewer, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).AllowAnonymous();
questionEndpoints.MapPost("/{id:guid}/answer", async (Guid id, AnswerQuestionRequest request, ClaimsPrincipal principal, AnswerQuestionHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new QuestionId(id), new QuestionUserId(actor.Value), request.Answer, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");
questionEndpoints.MapPut("/{id:guid}/archive", (Guid id, ClaimsPrincipal principal, ChangeQuestionStateHandler handler, CancellationToken token) => ChangeQuestionStateAsync(id, principal, false, handler, token)).RequireRateLimiting("social-write");
questionEndpoints.MapDelete("/{id:guid}", (Guid id, ClaimsPrincipal principal, ChangeQuestionStateHandler handler, CancellationToken token) => ChangeQuestionStateAsync(id, principal, true, handler, token)).RequireRateLimiting("social-write");

var contentEndpoints = app.MapGroup("/api/v1/content").WithTags("Content");
contentEndpoints.MapPost("/", async (CreatePostRequest request, ClaimsPrincipal principal, CreatePostHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new(new ContentAuthorId(actor.Value), request.Text, request.MediaIds,
        request.Visibility, request.ShareKind, request.OriginalPostId.HasValue ? new PostId(request.OriginalPostId.Value) : null,
        request.LinkUrl, request.ContentWarning, request.IsSensitive, request.IsDraft, request.PublishAtUtc), token);
    return result.IsSuccess ? Results.Created($"/api/v1/content/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, GetContentHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? actor.Value : (Guid?)null;
    var result = await handler.HandleAsync(id, viewer, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
});
contentEndpoints.MapPut("/{id:guid}", async (Guid id, UpdatePostRequest request, ClaimsPrincipal principal, UpdatePostHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new(new PostId(id), new ContentAuthorId(actor.Value), request.Text, request.MediaIds,
        request.Visibility, request.LinkUrl, request.ContentWarning, request.IsSensitive, request.ExpectedVersion), token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapPut("/{id:guid}/{change:regex(archive|restore|pin|unpin)}", (Guid id, string change, ClaimsPrincipal principal, ChangePostHandler handler, CancellationToken token) =>
    ChangePostAsync(id, change, principal, handler, token)).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapDelete("/{id:guid}", (Guid id, ClaimsPrincipal principal, ChangePostHandler handler, CancellationToken token) =>
    ChangePostAsync(id, "delete", principal, handler, token)).RequireAuthorization().RequireRateLimiting("social-write");

contentEndpoints.MapPost("/{id:guid}/poll", async (Guid id, CreatePollRequest request, ClaimsPrincipal principal, CreatePollHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.Question, request.Options, request.AllowMultiple, request.ClosesAtUtc, token);
    return result.IsSuccess ? Results.Created($"/api/v1/content/{id:D}/poll", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapGet("/{id:guid}/poll", async (Guid id, ClaimsPrincipal principal, GetPollHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? actor.Value : (Guid?)null;
    var result = await handler.HandleAsync(id, viewer, token);
    return result.IsSuccess
        ? Results.Ok(result.Value)
        : result.Error.Code == "poll.not_found"
            ? Results.NoContent()
            : ToProblem(result.Error);
});
contentEndpoints.MapPost("/{id:guid}/poll/votes", async (Guid id, VotePollRequest request, ClaimsPrincipal principal, VotePollHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.OptionIds.ToHashSet(), token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapPut("/{id:guid}/saved", async (Guid id, SaveContentRequest request, ClaimsPrincipal principal, SaveContentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.SaveAsync(actor.Value, id, request.Collection, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapDelete("/{id:guid}/saved", async (Guid id, string? collection, ClaimsPrincipal principal, SaveContentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    await handler.RemoveAsync(actor.Value, id, collection, token); return Results.NoContent();
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapGet("/saved", async (string? collection, int? limit, string? cursor, ClaimsPrincipal principal, ListSavedContentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try { return Results.Ok(await handler.HandleAsync(actor.Value, collection, limit ?? 30, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
}).RequireAuthorization();
contentEndpoints.MapPost("/{id:guid}/impressions", async (Guid id, HttpContext context, RecordImpressionHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(context.User, out var actor) ? actor.Value : (Guid?)null;
    var anonymousSession = context.Request.Headers["X-View-Session"].FirstOrDefault();
    var result = await handler.HandleAsync(id, viewer, anonymousSession, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");

contentEndpoints.MapPut("/{id:guid}/reaction", async (Guid id, SetReactionRequest request, ClaimsPrincipal principal, SetReactionHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.Kind, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapDelete("/{id:guid}/reaction", async (Guid id, ClaimsPrincipal principal, SetReactionHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, null, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapGet("/{id:guid}/reactions", async (Guid id, ClaimsPrincipal principal, IReactionsModule reactions, CancellationToken token) =>
    Results.Ok(await reactions.GetSummaryAsync(id, TryGetUserId(principal, out var actor) ? actor.Value : null, token)));
contentEndpoints.MapPost("/{id:guid}/comments", async (Guid id, CreateCommentRequest request, ClaimsPrincipal principal, CreateCommentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.ParentId, request.Text, token); return result.IsSuccess ? Results.Created($"/api/v1/content/{id}/comments/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapGet("/{id:guid}/comments", async (Guid id, int? limit, string? cursor, ClaimsPrincipal principal, ListCommentsHandler handler, CancellationToken token) =>
{
    try { return Results.Ok(await handler.HandleAsync(id, TryGetUserId(principal, out var actor) ? actor.Value : null, limit ?? 20, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
contentEndpoints.MapPut("/{contentId:guid}/comments/{commentId:guid}", async (Guid contentId, Guid commentId, UpdateCommentRequest request, ClaimsPrincipal principal, ChangeCommentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized(); var result = await handler.HandleAsync(contentId, commentId, actor.Value, request.Text, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
contentEndpoints.MapDelete("/{contentId:guid}/comments/{commentId:guid}", async (Guid contentId, Guid commentId, ClaimsPrincipal principal, ChangeCommentHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized(); var result = await handler.HandleAsync(contentId, commentId, actor.Value, null, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");

var feedEndpoints = app.MapGroup("/api/v1/feed").WithTags("Feed").RequireAuthorization();
feedEndpoints.MapGet("/{kind}", async (FeedKind kind, int? limit, string? cursor, Guid? profileId, ClaimsPrincipal principal, GetFeedHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try
    {
        return Results.Ok(await handler.HandleAsync(kind, actor.Value, limit ?? 20, cursor, profileId, token));
    }
    catch (DomainRuleException exception)
    {
        return ToProblem(new OperationError(exception.Code, exception.Message));
    }
});

var messagingEndpoints = app.MapGroup("/api/v1/messaging").WithTags("Messaging").RequireAuthorization();
messagingEndpoints.MapPost("/conversations", async (CreateConversationRequest request, ClaimsPrincipal principal, CreateConversationHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(actor.Value, request.MemberIds, request.Title, token);
    return result.IsSuccess ? Results.Created($"/api/v1/messaging/conversations/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("message-write");
messagingEndpoints.MapGet("/conversations", async (int? limit, string? cursor, ClaimsPrincipal principal, ListConversationsHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try { return Results.Ok(await handler.HandleAsync(actor.Value, limit ?? 30, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
messagingEndpoints.MapGet("/conversations/{conversationId:guid}/messages", async (Guid conversationId, int? limit, string? cursor, ClaimsPrincipal principal, ListMessagesHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try { var result = await handler.HandleAsync(conversationId, actor.Value, limit ?? 50, cursor, token); return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
messagingEndpoints.MapPost("/conversations/{conversationId:guid}/messages", async (Guid conversationId, SendMessageRequest request, ClaimsPrincipal principal, SendMessageHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(conversationId, actor.Value, request.Text, request.MediaIds, request.ReplyToId, token);
    return result.IsSuccess ? Results.Created($"/api/v1/messaging/messages/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("message-write");
messagingEndpoints.MapPatch("/messages/{messageId:guid}", async (Guid messageId, ChangeMessageRequest request, ClaimsPrincipal principal, ChangeMessageHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(messageId, actor.Value, request.Change, request.Text, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("message-write");

var notificationEndpoints = app.MapGroup("/api/v1/notifications").WithTags("Notifications").RequireAuthorization();
notificationEndpoints.MapGet("/", async (int? limit, string? cursor, ClaimsPrincipal principal, ListNotificationsHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    try { return Results.Ok(await handler.HandleAsync(actor.Value, limit ?? 30, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
notificationEndpoints.MapPatch("/{id:guid}/read", async (Guid id, ClaimsPrincipal principal, MarkNotificationReadHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireRateLimiting("social-write");

var communityEndpoints = app.MapGroup("/api/v1/communities").WithTags("Communities");
communityEndpoints.MapGet("/", async (int? limit, ClaimsPrincipal principal, ListCommunitiesHandler handler, CancellationToken token) =>
{
    var actor = TryGetUserId(principal, out var userId) ? userId.Value : (Guid?)null;
    return Results.Ok(await handler.HandleAsync(actor, limit ?? 50, token));
});
communityEndpoints.MapGet("/{slug}", async (string slug, ClaimsPrincipal principal, GetCommunityHandler handler, CancellationToken token) =>
{
    var actor = TryGetUserId(principal, out var userId) ? userId.Value : (Guid?)null;
    var result = await handler.HandleAsync(slug, actor, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
});
communityEndpoints.MapGet("/{id:guid}/members", async (Guid id, MembershipStatus? status, int? limit,
    ClaimsPrincipal principal, ListCommunityMembersHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, status, limit ?? 50, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization();
communityEndpoints.MapPost("/", async (CreateCommunityRequest request, ClaimsPrincipal principal, CreateCommunityHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(actor.Value, request.Slug, request.Name, request.Description, request.Visibility, token);
    return result.IsSuccess ? Results.Created($"/api/v1/communities/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
communityEndpoints.MapPost("/{id:guid}/change", async (Guid id, ChangeCommunityRequest request, ClaimsPrincipal principal, ChangeCommunityHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.Change, request.TargetId, request.Reason, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
communityEndpoints.MapPut("/{id:guid}/rules", async (Guid id, SetCommunityRulesRequest request, ClaimsPrincipal principal, ConfigureCommunityHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.SetRulesAsync(id, actor.Value, request.Rules, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
communityEndpoints.MapPut("/{id:guid}/pins/{contentId:guid}", async (Guid id, Guid contentId, bool? pinned, ClaimsPrincipal principal, ConfigureCommunityHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.PinAsync(id, actor.Value, contentId, pinned ?? true, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");

var mediaEndpoints = app.MapGroup("/api/v1/media").WithTags("Media");
mediaEndpoints.MapPost("/", async (InitiateMediaRequest request, ClaimsPrincipal principal, InitiateMediaHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(actor.Value, request.FileName, request.ContentType, request.Size, request.Visibility, token);
    return result.IsSuccess ? Results.Created(result.Value!.UploadUrl, result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
mediaEndpoints.MapPut("/{id:guid}/content", async (Guid id, HttpRequest request, ClaimsPrincipal principal, UploadMediaHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, request.Body, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write").DisableAntiforgery();
mediaEndpoints.MapGet("/{id:guid}/download", async (Guid id, string? variant, ClaimsPrincipal principal, DownloadMediaHandler handler, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? actor.Value : (Guid?)null;
    var result = await handler.HandleAsync(id, viewer, variant, token);
    return result.IsSuccess
        ? Results.Stream(result.Value!.Content, result.Value.ContentType, result.Value.FileName, enableRangeProcessing: true)
        : ToProblem(result.Error);
});
mediaEndpoints.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, DeleteMediaHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");

var storyEndpoints = app.MapGroup("/api/v1/stories").WithTags("Stories");
storyEndpoints.MapPost("/", async (CreateStoryRequest request, ClaimsPrincipal principal, CreateStoryHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(actor.Value, request.MediaId, request.Caption, request.Audience, token);
    return result.IsSuccess ? Results.Created($"/api/v1/stories/{result.Value!.Id:D}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");
storyEndpoints.MapGet("/", async (int? limit, string? cursor, ClaimsPrincipal principal, ListStoriesHandler handler, CancellationToken token) =>
{
    try { return Results.Ok(await handler.ActiveAsync(TryGetUserId(principal, out var actor) ? actor.Value : null, limit ?? 20, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
storyEndpoints.MapGet("/profile/{ownerId:guid}", async (Guid ownerId, int? limit, string? cursor, ClaimsPrincipal principal, ListStoriesHandler handler, CancellationToken token) =>
{
    try { return Results.Ok(await handler.ProfileAsync(ownerId, TryGetUserId(principal, out var actor) ? actor.Value : null, limit ?? 20, cursor, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
});
storyEndpoints.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, GetStoryHandler handler, CancellationToken token) =>
{
    var result = await handler.HandleAsync(id, TryGetUserId(principal, out var actor) ? actor.Value : null, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
});
storyEndpoints.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, DeleteStoryHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(id, actor.Value, token);
    return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("social-write");

var searchEndpoints = app.MapGroup("/api/v1/search").WithTags("Search");
searchEndpoints.MapGet("/", async (string q, SearchDocumentType? type, int? limit, ClaimsPrincipal principal,
    ISearchModule search, CancellationToken token) =>
{
    var viewer = TryGetUserId(principal, out var actor) ? actor.Value : (Guid?)null;
    try { return Results.Ok(await search.SearchAsync(q, viewer, type, limit ?? 20, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
}).RequireRateLimiting("search-read");
searchEndpoints.MapGet("/recent", async (int? limit, ClaimsPrincipal principal, SearchDiscoveryHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    return Results.Ok(await handler.RecentAsync(actor.Value, limit ?? 10, token));
}).RequireAuthorization().RequireRateLimiting("search-read");
searchEndpoints.MapGet("/trending", async (int? limit, SearchDiscoveryHandler handler, CancellationToken token) =>
    Results.Ok(await handler.TrendingAsync(limit ?? 20, token))).RequireRateLimiting("search-read");

var auditEndpoints = app.MapGroup("/api/v1/administration/audit").WithTags("Audit")
    .RequireAuthorization("Administration");
auditEndpoints.MapGet("/", async (Guid? actorId, string? action, string? targetType, DateTimeOffset? from,
    DateTimeOffset? to, int? limit, SearchAuditHandler handler, CancellationToken token) =>
    Results.Ok(await handler.HandleAsync(actorId, action, targetType, from, to, limit ?? 100, token)));

var moderationEndpoints = app.MapGroup("/api/v1/moderation").WithTags("Moderation");
moderationEndpoints.MapPost("/reports", async (CreateModerationReportRequest request, ClaimsPrincipal principal,
    CreateReportHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(actor.Value, request.SubjectType, request.SubjectId, request.Reason,
        request.Details, request.EvidenceReferences, token);
    return result.IsSuccess ? Results.Created($"/api/v1/moderation/reports/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("report-write");
moderationEndpoints.MapGet("/cases", async (ModerationCaseStatus? status, int? limit,
    ListModerationCasesHandler handler, CancellationToken token) => Results.Ok(await handler.HandleAsync(status, limit ?? 50, token)))
    .RequireAuthorization("Moderation");
moderationEndpoints.MapPost("/reports/{reportId:guid}/triage", async (Guid reportId, TriageModerationReportRequest request,
    HttpContext context, TriageReportHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(reportId, actor.Value, request.TargetUserId, context.TraceIdentifier, token);
    return result.IsSuccess ? Results.Created($"/api/v1/moderation/cases/{result.Value!.Id}", result.Value) : ToProblem(result.Error);
}).RequireAuthorization("Moderation").RequireRateLimiting("social-write");
moderationEndpoints.MapPatch("/cases/{caseId:guid}", async (Guid caseId, ChangeModerationCaseRequest request,
    HttpContext context, ChangeModerationCaseHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(caseId, actor.Value, request.Change, request.AssigneeId, request.Reason,
        request.Enforcement, request.ExpiresAtUtc, request.AppealAccepted, context.TraceIdentifier, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization("Moderation").RequireRateLimiting("social-write");
moderationEndpoints.MapPost("/cases/{caseId:guid}/appeal", async (Guid caseId, AppealModerationCaseRequest request,
    ClaimsPrincipal principal, AppealModerationCaseHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(caseId, actor.Value, request.Text, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}).RequireAuthorization().RequireRateLimiting("report-write");

var administrationEndpoints = app.MapGroup("/api/v1/administration/configuration").WithTags("Administration")
    .RequireAuthorization("Administration");
administrationEndpoints.MapGet("/dashboard", async (AdministrationHandler handler, CancellationToken token) =>
    Results.Ok(await handler.DashboardAsync(token)));
administrationEndpoints.MapPut("/flags/{key}", async (string key, SetFeatureFlagRequest request, HttpContext context,
    AdministrationHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var actor)) return Results.Unauthorized();
    try { return Results.Ok(await handler.SetFlagAsync(actor.Value, key, request.Description, request.Enabled,
        request.RolloutPercentage, context.TraceIdentifier, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
}).RequireRateLimiting("social-write");
administrationEndpoints.MapPut("/settings/{key}", async (string key, SetSystemSettingRequest request, HttpContext context,
    AdministrationHandler handler, CancellationToken token) =>
{
    if (!TryGetUserId(context.User, out var actor)) return Results.Unauthorized();
    try { return Results.Ok(await handler.SetSettingAsync(actor.Value, key, request.ValueJson, request.Description,
        context.TraceIdentifier, token)); }
    catch (DomainRuleException exception) { return ToProblem(new(exception.Code, exception.Message)); }
}).RequireRateLimiting("social-write");

app.MapHub<MessagingHub>("/hubs/messaging");

app.Run();

static string RateLimitKey(HttpContext context, bool authenticated)
{
    var subject = authenticated ? context.User.FindFirstValue("sub") : null;
    return Guid.TryParse(subject, out var userId)
        ? $"user:{userId:N}"
        : $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
}

static FixedWindowRateLimiterOptions FixedWindow(int permitLimit, TimeSpan window) => new()
{
    PermitLimit = permitLimit,
    Window = window,
    QueueLimit = 0,
    AutoReplenishment = true
};

static IResult ToProblem(OperationError error)
{
    var status = error.Code.Contains("conflict", StringComparison.Ordinal) ? StatusCodes.Status409Conflict
        : error.Code is "identity.invalid_credentials" or "identity.refresh_invalid" or "identity.refresh_reuse_detected" ? StatusCodes.Status401Unauthorized
        : error.Code is "identity.account_locked" ? StatusCodes.Status423Locked
        : error.Code.EndsWith("not_found", StringComparison.Ordinal) ? StatusCodes.Status404NotFound
        : error.Code.EndsWith("not_visible", StringComparison.Ordinal) || error.Code.EndsWith("forbidden", StringComparison.Ordinal) || error.Code.EndsWith("not_member", StringComparison.Ordinal) || error.Code.EndsWith("blocked", StringComparison.Ordinal) ? StatusCodes.Status403Forbidden
        : StatusCodes.Status400BadRequest;
    return Results.Problem(statusCode: status, title: "İstek işlenemedi", detail: error.Message, extensions: new Dictionary<string, object?> { ["code"] = error.Code });
}

static bool TryGetUserId(ClaimsPrincipal principal, out UserId userId)
{
    var value = principal.FindFirstValue("sub");
    var parsed = Guid.TryParse(value, out var id);
    userId = parsed ? new UserId(id) : default;
    return parsed;
}

static async Task<IResult> ChangeRelationshipAsync(
    Guid targetId,
    ClaimsPrincipal principal,
    RelationshipChange change,
    ChangeRelationshipHandler handler,
    CancellationToken cancellationToken)
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new GraphUserId(actor.Value), new GraphUserId(targetId), change, cancellationToken);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}

static async Task<IResult> ChangeQuestionStateAsync(Guid id, ClaimsPrincipal principal, bool delete, ChangeQuestionStateHandler handler, CancellationToken token)
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var result = await handler.HandleAsync(new QuestionId(id), new QuestionUserId(actor.Value), delete, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}

static async Task<IResult> ChangePostAsync(Guid id, string change, ClaimsPrincipal principal, ChangePostHandler handler, CancellationToken token)
{
    if (!TryGetUserId(principal, out var actor)) return Results.Unauthorized();
    var kind = change switch { "archive" => PostChange.Archive, "restore" => PostChange.Restore, "pin" => PostChange.Pin, "unpin" => PostChange.Unpin, _ => PostChange.Delete };
    var result = await handler.HandleAsync(new PostId(id), new ContentAuthorId(actor.Value), kind, token);
    return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
}
