$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspace
npm run api:generate
Write-Host 'OpenAPI TypeScript istemcisi yeniden üretildi.'
