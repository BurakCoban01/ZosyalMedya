<#
.SYNOPSIS
  Run a command using the Node version specified in .nvmrc,
  without changing the global nvm symlink.

.DESCRIPTION
  Reads .nvmrc (searching upward from the script root), resolves the
  matching Node binary under NVM_HOME, prepends it to PATH for the
  current process, then invokes the supplied command.

  The global `nvm use` state is left untouched.

  Because this script does NOT use [CmdletBinding], arbitrary flags
  (e.g. -v, --silent) pass through to the child command without being
  consumed by PowerShell common-parameter binding.

.EXAMPLE
  .\scripts\with-project-node.ps1 node -v
  .\scripts\with-project-node.ps1 npm ci
  .\scripts\with-project-node.ps1 npm run test:web -- --filter=feed
#>
param()

$ErrorActionPreference = 'Stop'

# --- Locate .nvmrc by searching upward from this script's directory ---

$SearchDir = Split-Path -Parent $PSScriptRoot  # repo root when script is in scripts/
$NvmrcPath = $null

for ($i = 0; $i -lt 10; $i++) {
  $Candidate = Join-Path $SearchDir '.nvmrc'
  if (Test-Path $Candidate) {
    $NvmrcPath = $Candidate
    break
  }
  $Parent = Split-Path -Parent $SearchDir
  if ($Parent -eq $SearchDir) { break }
  $SearchDir = $Parent
}

if (-not $NvmrcPath) {
  Write-Error '.nvmrc not found in or above the script directory.'
  exit 1
}

# --- Parse version (strip leading v, trim whitespace) ---

$RawVersion = (Get-Content $NvmrcPath | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
if ($RawVersion -match '^v?(.+)') { $RawVersion = $Matches[1] }

# --- Resolve Node directory under NVM_HOME ---

$NvmHome = $env:NVM_HOME
if (-not $NvmHome) {
  $NvmHome = Join-Path $env:LOCALAPPDATA 'nvm'
}

# nvm4w stores versions in subdirs: v<major>.<minor>.<patch>
$NodeDir = Join-Path $NvmHome "v$RawVersion"
$NodeExe = Join-Path $NodeDir 'node.exe'

if (-not (Test-Path $NodeExe)) {
  Write-Error "Node v$RawVersion not found at $NodeExe.`nRun: nvm install $RawVersion"
  exit 1
}

Write-Host "[with-project-node] Node v$RawVersion from $NodeDir" -ForegroundColor DarkGray

# --- Prepend project Node to PATH for this process only ---
$env:PATH = "$NodeDir;$env:PATH"

# --- Execute ---

if ($args.Count -eq 0) {
  Write-Host 'No command supplied. Usage: .\scripts\with-project-node.ps1 <command> [args...]'
  & $NodeExe -v
  exit 0
}

$CmdString = $args -join ' '
Invoke-Expression $CmdString
exit $LASTEXITCODE
