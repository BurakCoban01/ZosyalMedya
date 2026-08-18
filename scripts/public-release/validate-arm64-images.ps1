[CmdletBinding()]
param(
    [switch]$BuildOwnedImages
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

$externalImages = @(
    'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685',
    'mongo:7-jammy@sha256:d29d168ee010c2d701720aa909fe44baa86dfc54e6ccc54e3781c518fab525f7',
    'redis:7-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2',
    'clamav/clamav-debian:1.4_base@sha256:333e9cd0765fb8cb4f76a75d2435d70f6bd9b74794d7e68f34895fc28ff6ee0a',
    'mcr.microsoft.com/dotnet/sdk:9.0@sha256:35048e3a81e6a07c316e7bbbd80d80d2ba705fe5f23a8ed42b6638c8f4c20d30',
    'mcr.microsoft.com/dotnet/aspnet:8.0-alpine@sha256:b288317d8ed45bb763fa95dbc807cf9d36e3bf9373ec2fac6b6548675f1f4b23',
    'node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43',
    'nginxinc/nginx-unprivileged:1.31.3-alpine3.24@sha256:f972e5322b9797dc2a6b830030094426437b1ae7032e4644496395336ac6fdac',
    'golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83',
    'alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b'
)

foreach ($image in $externalImages) {
    $inspection = (& docker buildx imagetools inspect $image 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect image manifest '$image'.`n$inspection"
    }
    if ($inspection -notmatch '(?m)^\s*Platform:\s+linux/arm64(?:/v8)?\s*$') {
        throw "Image manifest does not advertise linux/arm64: $image"
    }
    Write-Host "ARM64 manifest verified: $image"
}

if ($BuildOwnedImages) {
    $ownedImages = @(
        @{ Name = 'api'; Dockerfile = 'src/Host/Api/Dockerfile' },
        @{ Name = 'web'; Dockerfile = 'apps/web-angular/Dockerfile' },
        @{ Name = 'minio'; Dockerfile = 'deploy/public-demo/minio/Dockerfile' }
    )
    foreach ($image in $ownedImages) {
        & docker buildx build --platform linux/arm64 --file (Join-Path $root $image.Dockerfile) `
            --tag "enterprise-social-community-platform-$($image.Name):arm64-gate" `
            --output type=cacheonly $root
        if ($LASTEXITCODE -ne 0) {
            throw "Owned linux/arm64 image build failed: $($image.Name)"
        }
    }
}

Write-Host 'ARM64 image gate passed.'
