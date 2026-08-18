param(
    [string]$ApiBaseUrl = 'http://localhost:58080',
    [string]$Password = $env:ESCP_DEMO_PASSWORD,
    [string]$PostgresContainer = 'zosyalmedya-postgres-1',
    [string]$PostgresUser = 'zosyalmedya',
    [string]$PostgresDatabase = 'zosyalmedya'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ([string]::IsNullOrWhiteSpace($Password)) {
    throw 'ESCP_DEMO_PASSWORD ortam değişkenini ayarla veya -Password parametresi ver.'
}

function New-IdentityV3PasswordHash {
    param([Parameter(Mandatory = $true)][string]$PlainText)

    $saltSource = [System.Text.Encoding]::UTF8.GetBytes("zosyal-local-fixture-v5:$PlainText")
    $saltDigest = [System.Security.Cryptography.SHA256]::Create().ComputeHash($saltSource)
    $salt = New-Object byte[] 16
    [Array]::Copy($saltDigest, 0, $salt, 0, $salt.Length)

    $iterations = 100000
    $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        $PlainText,
        $salt,
        $iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA512)
    $subkey = $derive.GetBytes(32)
    $derive.Dispose()

    $payload = New-Object byte[] (13 + $salt.Length + $subkey.Length)
    $payload[0] = 0x01
    foreach ($field in @(
        @{ Offset = 1; Value = 2 },
        @{ Offset = 5; Value = $iterations },
        @{ Offset = 9; Value = $salt.Length }
    )) {
        $networkBytes = [BitConverter]::GetBytes(
            [System.Net.IPAddress]::HostToNetworkOrder([int]$field.Value))
        [Array]::Copy($networkBytes, 0, $payload, [int]$field.Offset, 4)
    }
    [Array]::Copy($salt, 0, $payload, 13, $salt.Length)
    [Array]::Copy($subkey, 0, $payload, 13 + $salt.Length, $subkey.Length)
    return [Convert]::ToBase64String($payload)
}

$passwordHash = New-IdentityV3PasswordHash -PlainText $Password

foreach ($seedFile in @('seed-demo-data.sql', 'seed-demo-data-part2.sql', 'seed-demo-data-part3.sql')) {
    $source = Join-Path $PSScriptRoot $seedFile
    $target = "/tmp/$seedFile"
    docker cp $source "${PostgresContainer}:$target"
    if ($LASTEXITCODE -ne 0) { throw "$seedFile PostgreSQL containerına kopyalanamadı." }
    docker exec $PostgresContainer psql -U $PostgresUser -d $PostgresDatabase -v ON_ERROR_STOP=1 --set="fixture_password_hash=$passwordHash" -f $target
    if ($LASTEXITCODE -ne 0) { throw "$seedFile uygulanamadı." }
}

$ready = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl/health/ready"
if ($ready.StatusCode -ne 200) { throw 'API readiness kontrolü başarısız.' }

& (Join-Path $PSScriptRoot 'seed-demo-media.ps1') -ApiBaseUrl $ApiBaseUrl -Password $Password `
    -PostgresContainer $PostgresContainer -PostgresUser $PostgresUser -PostgresDatabase $PostgresDatabase
if (-not $?) { throw 'Medya fixture yüklemesi başarısız.' }

Set-Location $workspace
Write-Host 'Demo verisi idempotent olarak hazırlandı.'
