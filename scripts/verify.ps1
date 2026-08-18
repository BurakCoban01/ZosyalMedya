param([switch]$Infrastructure,[switch]$SkipFrontend)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspace

function Invoke-CheckedNative {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$FailureMessage
    )
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FailureMessage (exit $LASTEXITCODE)." }
}

Invoke-CheckedNative -Command 'dotnet' -Arguments @('restore', 'ZosyalMedya.sln') -FailureMessage 'dotnet restore failed'
& (Join-Path $workspace 'scripts/public-release/assert-dotnet-vulnerabilities.ps1')
Invoke-CheckedNative -Command 'dotnet' -Arguments @('build', 'ZosyalMedya.sln', '--no-restore') -FailureMessage 'dotnet build failed'
if ($Infrastructure) { $env:RUN_INFRASTRUCTURE_TESTS = 'true' }
Invoke-CheckedNative -Command 'dotnet' -Arguments @('test', 'ZosyalMedya.sln', '--no-build') -FailureMessage 'dotnet test failed'
if (-not $SkipFrontend) {
    $node = Join-Path $workspace 'scripts\with-project-node.ps1'
    Invoke-CheckedNative -Command $node -Arguments @('npm', 'ci') -FailureMessage 'npm ci failed'
    Invoke-CheckedNative -Command $node -Arguments @('npm', 'audit', '--audit-level=high') -FailureMessage 'npm audit failed'
    $sbom = & $node npm sbom --package-lock-only --omit=dev --sbom-format cyclonedx
    if ($LASTEXITCODE -ne 0) { throw 'npm runtime SBOM generation failed.' }
    $parsedSbom = $sbom | ConvertFrom-Json
    if ($parsedSbom.bomFormat -ne 'CycloneDX') { throw 'npm runtime SBOM is not CycloneDX.' }
    Invoke-CheckedNative -Command $node -Arguments @('npm', 'test') -FailureMessage 'npm test failed'
    Invoke-CheckedNative -Command $node -Arguments @('npm', 'run', 'build') -FailureMessage 'npm build failed'
}
Invoke-CheckedNative -Command 'docker' -Arguments @('compose', '--profile', 'core', 'config') -FailureMessage 'local Compose validation failed' | Out-Null
Invoke-CheckedNative -Command 'docker' -Arguments @('compose', '--env-file', '.env.public-demo.example', '-f', 'compose.public-demo.yaml', 'config', '--quiet') -FailureMessage 'public Compose validation failed'
Write-Host 'Doğrulama başarıyla tamamlandı.'
