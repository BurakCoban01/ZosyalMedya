param([switch]$WithApplication, [switch]$SeedDemoData)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspace
docker compose --profile core up -d --wait
if ($WithApplication) {
    if ([string]::IsNullOrWhiteSpace($env:JWT_SIGNING_KEY)) { throw 'WithApplication için JWT_SIGNING_KEY ortam değişkeni gereklidir.' }
    # Compose can otherwise restart containers that still reference an older
    # image even after the production images were rebuilt successfully.
    docker compose --profile core --profile app up -d --build --force-recreate --no-deps --wait api web
}
if ($SeedDemoData) {
    if (-not $WithApplication) { throw 'SeedDemoData, hazır API için scripts/seed-demo.ps1 ile veya WithApplication ile kullanılmalıdır.' }
    & (Join-Path $PSScriptRoot 'seed-demo.ps1')
}
docker compose ps
