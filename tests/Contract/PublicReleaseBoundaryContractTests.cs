using System.Diagnostics;
using System.Text.RegularExpressions;
using Xunit;

namespace ZosyalMedya.Tests.Contract;

public sealed class PublicReleaseBoundaryContractTests
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));

    [Fact]
    public void TrackedTreeContainsNoRuntimeSecretsOrMailArtifacts()
    {
        var start = new ProcessStartInfo("git", "ls-files")
        {
            WorkingDirectory = Root,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("git could not start");
        var output = process.StandardOutput.ReadToEnd();
        var error = process.StandardError.ReadToEnd();
        process.WaitForExit();
        Assert.True(process.ExitCode == 0, error);

        var forbidden = output.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Where(IsForbiddenTrackedPath)
            .ToArray();
        Assert.True(forbidden.Length == 0, $"Forbidden tracked runtime artifacts:{Environment.NewLine}{string.Join(Environment.NewLine, forbidden)}");
    }

    [Fact]
    public void DockerBuildContextDeniesPrivateRuntimeAndEvidenceTrees()
    {
        var dockerIgnore = File.ReadAllText(Path.Combine(Root, ".dockerignore"));
        string[] requiredRules =
        [
            "**/.local/**",
            "**/data-protection-keys/**",
            "**/email-pickup/**",
            "**/backups/**",
            "**/*.eml",
            "**/*.log",
            "docs/YararlanilabilirProje",
            "docs/task-evidence",
            ".playwright-mcp",
            ".git",
            ".env*"
        ];

        var effectiveRules = dockerIgnore.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#'))
            .ToArray();

        foreach (var rule in requiredRules)
            Assert.Contains(rule, effectiveRules);

        Assert.DoesNotContain(effectiveRules, rule => rule.StartsWith('!') &&
            requiredRules.Any(required => rule[1..].Equals(required, StringComparison.Ordinal)));
    }

    [Fact]
    public void ApiRuntimeMatchesTheApplicationTargetFramework()
    {
        var dockerfile = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Dockerfile"));
        var buildProperties = File.ReadAllText(Path.Combine(Root, "Directory.Build.props"));

        Assert.Contains("<TargetFramework>net8.0</TargetFramework>", buildProperties, StringComparison.Ordinal);
        Assert.Contains("mcr.microsoft.com/dotnet/aspnet:8.0-alpine", dockerfile, StringComparison.Ordinal);
        Assert.Contains("mcr.microsoft.com/dotnet/aspnet:8.0-alpine@sha256:", dockerfile, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicSurfacesUseTheLockedNameAndRetainFontNotices()
    {
        const string displayName = "Enterprise Social & Community Platform";
        var publicFiles = new[]
        {
            "README.md",
            "apps/web-angular/src/index.html",
            "apps/mobile-ionic/src/index.html",
            "apps/mobile-ionic/public/manifest.webmanifest",
            "contracts/openapi/api-v1.yaml"
        };
        foreach (var relativePath in publicFiles)
        {
            var text = File.ReadAllText(Path.Combine(Root, relativePath.Replace('/', Path.DirectorySeparatorChar)))
                .Replace("&amp;", "&", StringComparison.Ordinal);
            Assert.Contains(displayName, text, StringComparison.Ordinal);
            Assert.DoesNotContain("ZosyalMedya", text, StringComparison.OrdinalIgnoreCase);
        }

        var notices = File.ReadAllText(Path.Combine(Root, "THIRD_PARTY_NOTICES.md"));
        Assert.Contains("SIL Open Font License", notices, StringComparison.Ordinal);
        Assert.Contains("LICENSE-manrope.txt", notices, StringComparison.Ordinal);
        Assert.Contains("LICENSE-newsreader.txt", notices, StringComparison.Ordinal);
        Assert.True(File.Exists(Path.Combine(Root, "apps", "web-angular", "public", "fonts", "LICENSE-manrope.txt")));
        Assert.True(File.Exists(Path.Combine(Root, "apps", "web-angular", "public", "fonts", "LICENSE-newsreader.txt")));
        Assert.False(File.Exists(Path.Combine(Root, "LICENSE")), "No unproved project-wide open-source grant may be added.");
    }

    [Fact]
    public void PublicationExporterBuildsAnIsolatedSingleCommitBoundary()
    {
        var exporter = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "new-publication-repository.ps1"));
        string[] denied =
        [
            ".agents", ".codex", ".factory", "AGENTS.md", "CURRENT_FOCUS.md", "PLANS.md", "TASKS.md",
            "docs/agent", "docs/eski-agent-goals", "docs/task-evidence", "docs/tlmtlr", "docs/YararlanilabilirProje"
        ];

        foreach (var path in denied) Assert.Contains($"'{path}'", exporter, StringComparison.Ordinal);
        Assert.Contains("git archive", exporter, StringComparison.Ordinal);
        Assert.Contains("$archiveArguments += \":(exclude)$relativePath\"", exporter, StringComparison.Ordinal);
        Assert.Contains("-c diff.renames=false diff --name-only HEAD", exporter, StringComparison.Ordinal);
        Assert.Contains("init --quiet --initial-branch=main", exporter, StringComparison.Ordinal);
        Assert.Contains("rev-list --count HEAD", exporter, StringComparison.Ordinal);
        Assert.Contains("validate-publication-boundary.ps1", exporter, StringComparison.Ordinal);
        var validator = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "validate-publication-boundary.ps1"));
        Assert.Contains("Get-Command gitleaks", validator, StringComparison.Ordinal);
        Assert.Contains("must be version 8.30.1", validator, StringComparison.Ordinal);
        Assert.Contains("ghcr.io/gitleaks/gitleaks@sha256:", validator, StringComparison.Ordinal);
        Assert.DoesNotContain("git -C $outputPath remote", exporter, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("git -C $outputPath push", exporter, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PublicDemoComposeExposesOnlyTheHardenedWebIngress()
    {
        var compose = File.ReadAllText(Path.Combine(Root, "compose.public-demo.yaml"));
        var envExample = File.ReadAllText(Path.Combine(Root, ".env.public-demo.example"));
        var apiProgram = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Program.cs"));

        foreach (var service in new[] { "configuration-gate", "postgres", "mongodb", "mongodb-application-user", "redis", "minio", "clamav", "api" })
            Assert.DoesNotContain("ports:", ServiceBlock(compose, service), StringComparison.Ordinal);

        var web = ServiceBlock(compose, "web");
        Assert.Contains("ports:", web, StringComparison.Ordinal);
        Assert.Contains("${PUBLIC_HTTP_BIND:-127.0.0.1}", web, StringComparison.Ordinal);
        Assert.Contains("ASPNETCORE_ENVIRONMENT: Production", compose, StringComparison.Ordinal);
        Assert.Contains("Security__AllowedOrigins__0: ${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}", compose, StringComparison.Ordinal);
        Assert.Contains("Security__AllowedOrigins__1: ${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}", compose, StringComparison.Ordinal);
        Assert.Contains("--header='Host: '$${AllowedHosts} http://127.0.0.1:8081/health/ready", ServiceBlock(compose, "api"), StringComparison.Ordinal);
        var redisDependencyInjection = File.ReadAllText(Path.Combine(Root, "src", "BuildingBlocks", "Infrastructure", "Redis", "DependencyInjection.cs"));
        Assert.Contains("ConfigurationOptions.Parse(options.ConnectionString)", redisDependencyInjection, StringComparison.Ordinal);
        Assert.DoesNotContain("EndPoints = { options.ConnectionString }", redisDependencyInjection, StringComparison.Ordinal);
        Assert.Contains("Deployment__PersistentDataRoot: /var/lib/enterprise-social-community-platform", compose, StringComparison.Ordinal);
        Assert.Contains("Deployment__TrustedProxies__0: 127.0.0.1", compose, StringComparison.Ordinal);
        Assert.Contains("network_mode: service:web", compose, StringComparison.Ordinal);
        Assert.Contains("ASPNETCORE_URLS: http://127.0.0.1:8081", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__ObjectStorageProvider: Minio", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__AntivirusProvider: ClamAv", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__MaxFileBytes: \"26214400\"", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__OwnerQuotaBytes: \"268435456\"", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__MaxConcurrentProcessing: \"1\"", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__MaxConcurrentIngestion: \"2\"", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__MaxImagePixels: \"12000000\"", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Media__MaxVideoDurationSeconds: \"90\"", compose, StringComparison.Ordinal);
        Assert.Contains("MinRequestBodyDataRate = new(256 * 1024, TimeSpan.FromSeconds(10))", apiProgram,
            StringComparison.Ordinal);
        Assert.Contains("Modules__Questions__Persistence__Provider: MongoDb", compose, StringComparison.Ordinal);
        Assert.Contains("mongodb://platform:${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}@mongodb:27017/platform?authSource=platform", compose, StringComparison.Ordinal);
        Assert.Contains("Modules__Questions__Persistence__MongoDatabaseName: platform", compose, StringComparison.Ordinal);
        Assert.Contains("01-create-application-user.js:/docker-entrypoint-initdb.d/01-create-application-user.js:ro", compose, StringComparison.Ordinal);
        var mongoApplicationUser = ServiceBlock(compose, "mongodb-application-user");
        var mongoApplicationUserScript = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "mongodb", "01-create-application-user.js"));
        var mongoRootUserScript = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "mongodb", "ensure-root-user.js"));
        var configurationGate = ServiceBlock(compose, "configuration-gate");
        Assert.Contains("network_mode: none", configurationGate, StringComparison.Ordinal);
        Assert.Contains("service_completed_successfully", ServiceBlock(compose, "mongodb"), StringComparison.Ordinal);
        Assert.Contains("mongodb: { condition: service_healthy }", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("restart: \"no\"", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("read_only: true", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("network_mode: service:mongodb", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("timeout -s KILL 90s mongosh", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("ensure-root-user.js:ro", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("ensure-application-user.js:ro", mongoApplicationUser, StringComparison.Ordinal);
        Assert.Contains("mongodb-application-user: { condition: service_completed_successfully }", ServiceBlock(compose, "api"), StringComparison.Ordinal);
        Assert.Contains("database.getUser(username)", mongoApplicationUserScript, StringComparison.Ordinal);
        Assert.Contains("database.updateUser(username, definition)", mongoApplicationUserScript, StringComparison.Ordinal);
        Assert.Contains("database.createUser({ user: username, ...definition })", mongoApplicationUserScript, StringComparison.Ordinal);
        Assert.Contains("admin.createUser({", mongoRootUserScript, StringComparison.Ordinal);
        Assert.DoesNotContain("admin.getUser", mongoRootUserScript, StringComparison.Ordinal);
        Assert.Contains("roles: [{ role: 'root', db: 'admin' }]", mongoRootUserScript, StringComparison.Ordinal);
        Assert.Contains("tr '[:upper:]' '[:lower:]'", configurationGate, StringComparison.Ordinal);
        Assert.Contains("fold -w 1 | sort -u | wc -l", configurationGate, StringComparison.Ordinal);
        Assert.Contains("test \"$$unique\" -ge 8", configurationGate, StringComparison.Ordinal);
        Assert.Contains("test \"$$MONGO_ROOT_PASSWORD\" != \"$$MONGO_APP_PASSWORD\"", configurationGate, StringComparison.Ordinal);
        Assert.DoesNotContain("MONGO_ROOT_PASSWORD", ServiceBlock(compose, "api"), StringComparison.Ordinal);
        Assert.Contains("api-data:/var/lib/enterprise-social-community-platform", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("networks:", compose, StringComparison.Ordinal);
        Assert.Contains("${JWT_SIGNING_KEY:?JWT_SIGNING_KEY is required}", compose, StringComparison.Ordinal);
        Assert.Contains("PUBLIC_DEMO_MODE: \"true\"", compose, StringComparison.Ordinal);
        Assert.Contains("max-size: \"10m\"", compose, StringComparison.Ordinal);
        Assert.Contains("max-file: \"3\"", compose, StringComparison.Ordinal);
        Assert.Contains("deploy/public-demo/minio/Dockerfile", ServiceBlock(compose, "minio"), StringComparison.Ordinal);
        Assert.Contains("http://127.0.0.1:9000/minio/health/live", ServiceBlock(compose, "minio"), StringComparison.Ordinal);
        Assert.Contains("clamav/clamav-debian:1.4_base@sha256:", ServiceBlock(compose, "clamav"), StringComparison.Ordinal);
        Assert.Contains("timeout -s KILL 45s mongosh", ServiceBlock(compose, "mongodb"), StringComparison.Ordinal);
        Assert.DoesNotContain("--username", ServiceBlock(compose, "mongodb"), StringComparison.Ordinal);
        Assert.Contains("mem_limit: 512m", ServiceBlock(compose, "mongodb"), StringComparison.Ordinal);
        Assert.Contains("start_period: 300s", ServiceBlock(compose, "postgres"), StringComparison.Ordinal);
        Assert.Contains("mem_limit: 1280m", ServiceBlock(compose, "clamav"), StringComparison.Ordinal);
        Assert.Contains("start_period: 300s", ServiceBlock(compose, "clamav"), StringComparison.Ordinal);
        Assert.Contains("start_period: 600s", ServiceBlock(compose, "web"), StringComparison.Ordinal);
        foreach (var service in new[] { "postgres", "mongodb", "mongodb-application-user", "redis", "clamav" })
            Assert.Contains("@sha256:", ServiceBlock(compose, service), StringComparison.Ordinal);

        var apiDockerfile = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Dockerfile"));
        var webDockerfile = File.ReadAllText(Path.Combine(Root, "apps", "web-angular", "Dockerfile"));
        Assert.All(apiDockerfile.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).Where(line => line.StartsWith("FROM ", StringComparison.Ordinal)),
            line => Assert.Contains("@sha256:", line, StringComparison.Ordinal));
        Assert.All(webDockerfile.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).Where(line => line.StartsWith("FROM ", StringComparison.Ordinal)),
            line => Assert.Contains("@sha256:", line, StringComparison.Ordinal));
        var minioDockerfile = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "minio", "Dockerfile"));
        Assert.Contains("https://github.com/pgsty/silo.git", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("3be10fcc1a44f6620ded0bd303461f9d688cca23", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("go build -p 2 -trimpath", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("LICENSE-silo-AGPL-3.0.txt /licenses/AGPL-3.0.txt", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("org.opencontainers.image.revision=\"3be10fcc1a44f6620ded0bd303461f9d688cca23\"", minioDockerfile,
            StringComparison.Ordinal);
        Assert.Contains("org.opencontainers.image.licenses=\"AGPL-3.0-only\"", minioDockerfile, StringComparison.Ordinal);
        var siloLicense = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "minio", "LICENSE-silo-AGPL-3.0.txt"));
        Assert.Contains("GNU AFFERO GENERAL PUBLIC LICENSE", siloLicense, StringComparison.Ordinal);
        Assert.Contains("Version 3, 19 November 2007", siloLicense, StringComparison.Ordinal);
        Assert.Contains("USER minio", minioDockerfile, StringComparison.Ordinal);
        Assert.All(minioDockerfile.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).Where(line => line.StartsWith("FROM ", StringComparison.Ordinal)),
            line => Assert.Contains("@sha256:", line, StringComparison.Ordinal));
        Assert.Contains("replace_with_base64_of_at_least_32_random_bytes", envExample, StringComparison.Ordinal);
        Assert.DoesNotContain("local_only_change_me", compose, StringComparison.Ordinal);
    }

    [Fact]
    public void Arm64ReleaseGateCoversEveryOwnedImageAndPinnedExternalBase()
    {
        var gate = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "validate-arm64-images.ps1"));
        foreach (var image in new[] { "postgres:16-alpine@sha256:", "mongo:7-jammy@sha256:", "redis:7-alpine@sha256:",
                     "clamav/clamav-debian:1.4_base@sha256:", "mcr.microsoft.com/dotnet/sdk:9.0@sha256:",
                     "mcr.microsoft.com/dotnet/aspnet:8.0-alpine@sha256:", "node:24-alpine@sha256:",
                     "nginxinc/nginx-unprivileged:1.31.3-alpine3.24@sha256:", "golang:1.26.6-alpine@sha256:", "alpine:3.24@sha256:" })
            Assert.Contains(image, gate, StringComparison.Ordinal);

        Assert.Contains("imagetools inspect", gate, StringComparison.Ordinal);
        Assert.Contains("--platform linux/arm64", gate, StringComparison.Ordinal);
        Assert.Contains("src/Host/Api/Dockerfile", gate, StringComparison.Ordinal);
        Assert.Contains("apps/web-angular/Dockerfile", gate, StringComparison.Ordinal);
        Assert.Contains("deploy/public-demo/minio/Dockerfile", gate, StringComparison.Ordinal);
        Assert.DoesNotContain("--push", gate, StringComparison.OrdinalIgnoreCase);

        var apiDockerfile = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Dockerfile"));
        var webDockerfile = File.ReadAllText(Path.Combine(Root, "apps", "web-angular", "Dockerfile"));
        var minioDockerfile = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "minio", "Dockerfile"));
        Assert.Contains("FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk", apiDockerfile, StringComparison.Ordinal);
        Assert.Contains("FROM --platform=$BUILDPLATFORM node:24-alpine", webDockerfile, StringComparison.Ordinal);
        Assert.Contains("FROM --platform=$BUILDPLATFORM golang:1.26.6-alpine", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("ARG TARGETOS", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("ARG TARGETARCH", minioDockerfile, StringComparison.Ordinal);
        Assert.Contains("GOOS=$TARGETOS GOARCH=$TARGETARCH", minioDockerfile, StringComparison.Ordinal);
        Assert.DoesNotContain("GOBIN=/out", minioDockerfile, StringComparison.Ordinal);
    }

    [Fact]
    public void CiPinsActionsAndAuditsRuntimeDependencyBoundaries()
    {
        var workflow = File.ReadAllText(Path.Combine(Root, ".github", "workflows", "ci.yml"));
        var verifier = File.ReadAllText(Path.Combine(Root, "scripts", "verify.ps1"));
        var nugetAudit = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "assert-dotnet-vulnerabilities.ps1"));

        foreach (var action in new[]
                 {
                     "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
                     "actions/setup-dotnet@67a3573c9a986a3f9c594539f4ab511d57bb3ce9",
                     "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
                     "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
                     "aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1"
                 })
            Assert.Contains(action, workflow, StringComparison.Ordinal);

        Assert.DoesNotContain("uses: actions/checkout@v", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("uses: actions/setup-dotnet@v", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("uses: actions/setup-node@v", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("uses: actions/upload-artifact@v", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("uses: aquasecurity/trivy-action@0.", workflow, StringComparison.Ordinal);
        foreach (var command in new[]
                 {
                     "scripts/public-release/assert-dotnet-vulnerabilities.ps1",
                     "npm audit --audit-level=high",
                     "npm sbom --package-lock-only --omit=dev --sbom-format cyclonedx",
                     "docker compose --env-file .env.public-demo.example -f compose.public-demo.yaml config --quiet"
                 })
        {
            Assert.Contains(command, workflow, StringComparison.Ordinal);
        }

        Assert.Contains("permissions:\n  contents: read", workflow.Replace("\r\n", "\n", StringComparison.Ordinal),
            StringComparison.Ordinal);
        Assert.Contains("package --vulnerable --include-transitive --format json", nugetAudit, StringComparison.Ordinal);
        Assert.Contains("Find-VulnerabilityNode", nugetAudit, StringComparison.Ordinal);
        Assert.Contains("if ($findings.Count -gt 0)", nugetAudit, StringComparison.Ordinal);
        Assert.Contains("Invoke-CheckedNative", verifier, StringComparison.Ordinal);
        Assert.Contains("scripts/public-release/assert-dotnet-vulnerabilities.ps1", verifier, StringComparison.Ordinal);
        Assert.Contains("@('npm', 'audit', '--audit-level=high')", verifier, StringComparison.Ordinal);
        Assert.Contains("npm sbom --package-lock-only --omit=dev --sbom-format cyclonedx", verifier, StringComparison.Ordinal);
        Assert.Contains("@('compose', '--env-file', '.env.public-demo.example'", verifier, StringComparison.Ordinal);
        foreach (var dockerfile in new[]
                 {
                     "src/Host/Api/Dockerfile",
                     "apps/web-angular/Dockerfile",
                     "deploy/public-demo/minio/Dockerfile"
                 })
            Assert.Contains($"dockerfile: {dockerfile}", workflow, StringComparison.Ordinal);
        Assert.Contains("severity: HIGH,CRITICAL", workflow, StringComparison.Ordinal);
        Assert.Contains("ignore-unfixed: 'false'", workflow, StringComparison.Ordinal);
        Assert.Contains("exit-code: '1'", workflow, StringComparison.Ordinal);
        Assert.Contains("TRIVY_VEX: deploy/public-demo/minio/security.openvex.json", workflow, StringComparison.Ordinal);
        Assert.Equal(2, Regex.Matches(workflow, "version: v0.74.0", RegexOptions.CultureInvariant).Count);
        var minioVex = File.ReadAllText(Path.Combine(Root, "deploy", "public-demo", "minio", "security.openvex.json"));
        Assert.Contains("CVE-2026-39414", minioVex, StringComparison.Ordinal);
        Assert.Contains("pkg:golang/github.com/minio/minio@v0.0.0-20260806142117-3be10fcc1a44", minioVex,
            StringComparison.Ordinal);
        Assert.Contains("\"status\": \"fixed\"", minioVex, StringComparison.Ordinal);
        Assert.Contains("fd69c89", minioVex, StringComparison.Ordinal);
        Assert.Contains("format: cyclonedx", workflow, StringComparison.Ordinal);
        Assert.Contains("container-${{ matrix.name }}-sbom", workflow, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicDemoRequestBudgetsAreActorScopedAndEndpointSpecific()
    {
        var program = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Program.cs"));

        Assert.Contains("publicDemoEnabled ? 3 : 10", program, StringComparison.Ordinal);
        Assert.Contains("publicDemoEnabled ? 30 : 60", program, StringComparison.Ordinal);
        Assert.Contains("publicDemoEnabled ? 15 : 60", program, StringComparison.Ordinal);
        Assert.Contains("publicDemoEnabled ? 5 : 60", program, StringComparison.Ordinal);
        Assert.Contains("publicDemoEnabled ? 30 : 120", program, StringComparison.Ordinal);
        Assert.Contains("$\"user:{userId:N}\"", program, StringComparison.Ordinal);
        Assert.Contains("$\"ip:{context.Connection.RemoteIpAddress", program, StringComparison.Ordinal);
        Assert.True(program.IndexOf("app.UseAuthentication();", StringComparison.Ordinal) <
            program.IndexOf("app.UseRateLimiter();", StringComparison.Ordinal));
        foreach (var policy in new[] { "registration-write", "identity-write", "social-write", "message-write", "report-write", "search-read" })
            Assert.Contains($"RequireRateLimiting(\"{policy}\")", program, StringComparison.Ordinal);
        Assert.Contains("new MessagingRealtimeBudget(publicDemoEnabled ? 30 : 120)", program, StringComparison.Ordinal);
        var hub = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "MessagingHub.cs"));
        Assert.Equal(2, hub.Split("realtimeBudget.TryAcquire(userId)", StringSplitOptions.None).Length - 1);
        Assert.Contains("PartitionedRateLimiter.Create<Guid, Guid>", hub, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicDemoRetentionIsExplicitBoundedAndDisabledOutsidePublicMode()
    {
        var program = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "Program.cs"));
        var retention = File.ReadAllText(Path.Combine(Root, "src", "Host", "Api", "PublicDemoRetention.cs"));
        var compose = File.ReadAllText(Path.Combine(Root, "compose.public-demo.yaml"));

        Assert.Contains("if (publicDemoEnabled)", program, StringComparison.Ordinal);
        Assert.Contains("AddHostedService<PublicDemoRetentionWorker>()", program, StringComparison.Ordinal);
        Assert.Contains("[Range(1, 100)] public int BatchSize", retention, StringComparison.Ordinal);
        Assert.Contains("[Range(1, 25)] public int AccountBatchSize", retention, StringComparison.Ordinal);
        Assert.Contains("ListVisitorPageAsync", retention, StringComparison.Ordinal);
        Assert.Contains("ChangePostHandler", retention, StringComparison.Ordinal);
        Assert.Contains("ChangeQuestionStateHandler", retention, StringComparison.Ordinal);
        Assert.Contains("DeleteStoryHandler", retention, StringComparison.Ordinal);
        Assert.Contains("x.Status == MediaStatus.Ready", retention, StringComparison.Ordinal);
        Assert.Contains("x.Status == MediaStatus.Quarantined", retention, StringComparison.Ordinal);
        Assert.DoesNotContain("MediaStatus.Processing ||", retention, StringComparison.Ordinal);
        Assert.Contains("PublicDemo__Retention__ArtifactHours: \"24\"", compose, StringComparison.Ordinal);
        Assert.Contains("PublicDemo__Retention__BatchSize: \"50\"", compose, StringComparison.Ordinal);
        Assert.Contains("PublicDemo__Retention__AccountBatchSize: \"5\"", compose, StringComparison.Ordinal);
    }

    [Fact]
    public void PublicBackupAndRestoreAreCompleteChecksummedAndDisposable()
    {
        var backup = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "backup-public-demo.sh"));
        var restore = File.ReadAllText(Path.Combine(Root, "scripts", "public-release", "restore-public-demo-smoke.sh"));

        Assert.Contains("Backup output must be outside the repository", backup, StringComparison.Ordinal);
        Assert.Contains("Backup requires a completely clean source checkout", backup, StringComparison.Ordinal);
        Assert.Contains("stop api", backup, StringComparison.Ordinal);
        foreach (var artifact in new[] { "SOURCE_COMMIT", "postgres.dump", "mongo.archive.gz", "redis-data.tar.gz", "minio-data.tar.gz", "api-data.tar.gz" })
        {
            Assert.Contains(artifact, backup, StringComparison.Ordinal);
            Assert.Contains(artifact, restore, StringComparison.Ordinal);
        }
        Assert.Contains("sha256sum", backup, StringComparison.Ordinal);
        Assert.Contains("sha256sum -c SHA256SUMS", restore, StringComparison.Ordinal);
        Assert.Contains("Backup Compose digest does not match", restore, StringComparison.Ordinal);
        Assert.Contains("Backup source commit does not match", restore, StringComparison.Ordinal);
        Assert.Contains("status --porcelain --untracked-files=all", restore, StringComparison.Ordinal);
        Assert.Contains("--confirm-disposable", restore, StringComparison.Ordinal);
        Assert.Contains("^prv1-restore-", restore, StringComparison.Ordinal);
        Assert.Contains("label=com.docker.compose.project=$project_name", restore, StringComparison.Ordinal);
        Assert.Contains("/health/ready", restore, StringComparison.Ordinal);
        Assert.Contains("data-protection-keys", restore, StringComparison.Ordinal);
        Assert.Contains("if ((remove_after))", restore, StringComparison.Ordinal);
        Assert.Contains("down -v", restore, StringComparison.Ordinal);
    }

    [Fact]
    public void HumanDeploymentTemplatesAreStreamingSecretFreeAndTopologyExact()
    {
        var worker = File.ReadAllText(Path.Combine(Root, "deploy", "cloudflare-worker", "src", "index.ts"));
        var wrangler = File.ReadAllText(Path.Combine(Root, "deploy", "cloudflare-worker", "wrangler.example.toml"));
        var tsconfig = File.ReadAllText(Path.Combine(Root, "deploy", "cloudflare-worker", "tsconfig.json"));
        var workerTests = File.ReadAllText(Path.Combine(Root, "deploy", "cloudflare-worker", "tests", "index.test.mjs"));
        var workerReadme = File.ReadAllText(Path.Combine(Root, "deploy", "cloudflare-worker", "README.md"));
        var coolify = File.ReadAllText(Path.Combine(Root, "deploy", "coolify", "README.md"));

        Assert.Contains("init.body = request.body", worker, StringComparison.Ordinal);
        Assert.Contains("return fetch(new Request(target, init))", worker, StringComparison.Ordinal);
        Assert.Contains("export function buildTarget", worker, StringComparison.Ordinal);
        Assert.Contains("const target = buildTarget(incoming, origin)", worker, StringComparison.Ordinal);
        Assert.DoesNotContain("new URL(incoming.pathname + incoming.search", worker, StringComparison.Ordinal);
        Assert.Contains("//attacker.example/private", workerTests, StringComparison.Ordinal);
        Assert.Contains("assert.equal(target.origin, origin.origin)", workerTests, StringComparison.Ordinal);
        Assert.Contains("headers.delete(\"x-forwarded-for\")", worker, StringComparison.Ordinal);
        Assert.Contains("redirect: \"manual\"", worker, StringComparison.Ordinal);
        Assert.DoesNotContain("arrayBuffer(", worker, StringComparison.Ordinal);
        Assert.DoesNotContain(".text(", worker, StringComparison.Ordinal);
        Assert.DoesNotContain(".json(", worker, StringComparison.Ordinal);
        Assert.DoesNotContain("console.", worker, StringComparison.Ordinal);
        Assert.DoesNotContain("Authorization", worker, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Cookie", worker, StringComparison.OrdinalIgnoreCase);

        Assert.Contains("ORIGIN_URL = \"https://replace-with-hidden-coolify-origin.example\"", wrangler, StringComparison.Ordinal);
        Assert.Contains("PUBLIC_HOST = \"enterprise-social-community.example-account.workers.dev\"", wrangler, StringComparison.Ordinal);
        Assert.DoesNotContain("account_id", wrangler, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"noEmit\": true", tsconfig, StringComparison.Ordinal);
        Assert.Contains("No origin secret is implemented", workerReadme, StringComparison.Ordinal);
        Assert.Contains("leave Coolify `PUBLIC_HOST` set to the hidden origin hostname", workerReadme, StringComparison.OrdinalIgnoreCase);

        foreach (var variable in new[] { "PUBLIC_HOST", "PUBLIC_ORIGIN", "PUBLIC_HTTP_BIND", "PUBLIC_HTTP_PORT",
                     "POSTGRES_PASSWORD", "MONGO_ROOT_PASSWORD", "MONGO_APP_PASSWORD", "REDIS_PASSWORD",
                     "JWT_SIGNING_KEY", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD" })
            Assert.Contains($"`{variable}`", coolify, StringComparison.Ordinal);

        Assert.Contains("Assign one HTTPS domain to service `web`, container port `8080`", coolify, StringComparison.Ordinal);
        Assert.Contains("Read-Host -AsSecureString", coolify, StringComparison.Ordinal);
        Assert.Contains("ZeroFreeBSTR", coolify, StringComparison.Ordinal);
        Assert.DoesNotContain("Read-Host -MaskInput", coolify, StringComparison.Ordinal);
        Assert.Contains("Do not use `docker compose down -v`", coolify, StringComparison.Ordinal);
        Assert.Contains("HUMAN", coolify, StringComparison.OrdinalIgnoreCase);
    }

    private static string ServiceBlock(string compose, string service)
    {
        compose = compose.Replace("\r\n", "\n", StringComparison.Ordinal);
        var marker = $"  {service}:\n";
        var start = compose.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"Missing service: {service}");
        var next = compose.IndexOf("\n  ", start + marker.Length, StringComparison.Ordinal);
        while (next >= 0 && compose.AsSpan(next + 1).StartsWith("    ", StringComparison.Ordinal))
            next = compose.IndexOf("\n  ", next + 3, StringComparison.Ordinal);
        return next < 0 ? compose[start..] : compose[start..next];
    }

    private static bool IsForbiddenTrackedPath(string path)
    {
        var normalized = path.Replace('\\', '/');
        var extension = Path.GetExtension(normalized);
        return normalized.Contains("/.local/", StringComparison.OrdinalIgnoreCase) ||
            normalized.StartsWith(".local/", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("/data-protection-keys/", StringComparison.OrdinalIgnoreCase) ||
            normalized.StartsWith("data-protection-keys/", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("/email-pickup/", StringComparison.OrdinalIgnoreCase) ||
            normalized.StartsWith("email-pickup/", StringComparison.OrdinalIgnoreCase) ||
            normalized.Contains("/backups/", StringComparison.OrdinalIgnoreCase) ||
            normalized.StartsWith("backups/", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals(".local-api.stdout.log", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals(".local-api.stderr.log", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".log", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".eml", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".bak", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".dump", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".pfx", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".p12", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".pem", StringComparison.OrdinalIgnoreCase) ||
            extension.Equals(".key", StringComparison.OrdinalIgnoreCase);
    }
}
