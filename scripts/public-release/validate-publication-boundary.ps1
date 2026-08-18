[CmdletBinding()]
param(
    [switch]$ScanHistory,
    [string]$RepositoryPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
} else {
    (Resolve-Path -LiteralPath $RepositoryPath).Path
}
$gitleaksImage = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'

function Test-ForbiddenTrackedPath {
    param([Parameter(Mandatory)][string]$Path)

    $normalized = $Path.Replace('\', '/')
    return $normalized -match '(^|/)\.local(/|$)' -or
        $normalized -match '(^|/)\.local-api\.(stdout|stderr)\.log$' -or
        $normalized -match '(^|/)(data-protection-keys|email-pickup|backups)(/|$)' -or
        $normalized -match '\.log$' -or
        $normalized -match '\.(eml|bak|dump|pfx|p12|pem|key)$'
}

Push-Location -LiteralPath $repositoryRoot
try {
    $tracked = @(& git ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }

    $forbidden = @($tracked | Where-Object { Test-ForbiddenTrackedPath $_ })
    if ($forbidden.Count -gt 0) {
        throw "Forbidden tracked runtime artifacts:`n$($forbidden -join "`n")"
    }

    $dockerIgnore = Get-Content -LiteralPath '.dockerignore' -Raw
    $requiredDockerIgnoreRules = @(
        '**/.local/**',
        '**/data-protection-keys/**',
        '**/email-pickup/**',
        '**/backups/**',
        '**/*.eml',
        '**/*.log',
        'docs/YararlanilabilirProje',
        'docs/task-evidence',
        '.playwright-mcp',
        '.git',
        '.env*'
    )
    foreach ($rule in $requiredDockerIgnoreRules) {
        if ($dockerIgnore.IndexOf($rule, [StringComparison]::Ordinal) -lt 0) {
            throw ".dockerignore is missing required rule: $rule"
        }
    }

    if ($ScanHistory) {
        $nativeGitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
        if ($nativeGitleaks) {
            $nativeVersion = (& $nativeGitleaks.Source version 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0 -or $nativeVersion -notmatch '(?i)\bv?8\.30\.1\b') {
                throw "The native Gitleaks history scanner must be version 8.30.1; found '$nativeVersion'."
            }
        }
        elseif (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            throw 'Gitleaks 8.30.1 or Docker is required for the pinned history scan.'
        }

        $shallow = (& git rev-parse --is-shallow-repository).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Unable to determine whether the repository is shallow.' }
        if ($shallow -ne 'false') { throw 'A shallow repository cannot satisfy the complete-history release gate.' }

        $head = (& git rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the audited HEAD.' }
        $commitCount = (& git rev-list --count HEAD).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Unable to count the audited history.' }

        $scanParent = Join-Path $repositoryRoot '.prv1-scan-output'
        $safeScanParent = [IO.Path]::GetFullPath($scanParent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $scanRoot = Join-Path $scanParent ("history-{0}" -f [Guid]::NewGuid().ToString('N'))
        $nativeReportPath = Join-Path $scanParent ("report-{0}.json" -f [Guid]::NewGuid().ToString('N'))
        $resolvedScanRoot = [IO.Path]::GetFullPath($scanRoot)
        if (-not $resolvedScanRoot.StartsWith($safeScanParent, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to create unexpected scan path: $resolvedScanRoot"
        }
        New-Item -ItemType Directory -Path $scanParent -Force | Out-Null

        try {
            & git clone --no-local --quiet --no-checkout -- $repositoryRoot $resolvedScanRoot
            if ($LASTEXITCODE -ne 0) { throw 'Unable to create the disposable history-scan clone.' }

            $hasNativeErrorPreference = Test-Path variable:PSNativeCommandUseErrorActionPreference
            if ($hasNativeErrorPreference) {
                $nativeErrorPreference = $PSNativeCommandUseErrorActionPreference
                $PSNativeCommandUseErrorActionPreference = $false
            }
            $nativeErrorAction = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                if ($nativeGitleaks) {
                    & $nativeGitleaks.Source git --no-banner --redact=100 --report-format json `
                        --report-path $nativeReportPath $resolvedScanRoot *> $null
                    $scanExitCode = $LASTEXITCODE
                    if (-not (Test-Path -LiteralPath $nativeReportPath)) { $scanExitCode = 86 }
                    elseif ((Get-Item -LiteralPath $nativeReportPath).Length -eq 0 -and $scanExitCode -eq 0) { $report = '[]' }
                    else { $report = Get-Content -LiteralPath $nativeReportPath -Raw }
                }
                else {
                    $shellCommand = 'rm -f /tmp/report.json; gitleaks git --no-banner --redact=100 --report-format json --report-path /tmp/report.json /repo >/dev/null 2>&1; status=$?; test -f /tmp/report.json || exit 86; if test -s /tmp/report.json; then cat /tmp/report.json; elif test $status -eq 0; then printf "[]"; else exit 87; fi; exit $status'
                    # Docker Desktop cannot reliably read loose Git objects from a
                    # read-only Windows bind mount. Only this ignored disposable clone
                    # is writable; the live checkout and its .git are never exposed.
                    $report = & docker run --rm -v "${resolvedScanRoot}:/repo" --entrypoint /bin/sh `
                        $gitleaksImage -c $shellCommand 2>$null
                    $scanExitCode = $LASTEXITCODE
                }
            }
            finally {
                $ErrorActionPreference = $nativeErrorAction
                if ($hasNativeErrorPreference) {
                    $PSNativeCommandUseErrorActionPreference = $nativeErrorPreference
                }
            }
        }
        finally {
            if (Test-Path -LiteralPath $resolvedScanRoot) {
                if (-not $resolvedScanRoot.StartsWith($safeScanParent, [StringComparison]::OrdinalIgnoreCase)) {
                    throw "Refusing to remove unexpected scan path: $resolvedScanRoot"
                }
                Remove-Item -LiteralPath $resolvedScanRoot -Recurse -Force
            }
            if (Test-Path -LiteralPath $nativeReportPath) {
                Remove-Item -LiteralPath $nativeReportPath -Force
            }
        }

        if ($scanExitCode -notin 0, 1) {
            throw "Gitleaks failed with exit code $scanExitCode."
        }

        $reportText = $report -join "`n"
        if ([string]::IsNullOrWhiteSpace($reportText)) { throw 'Gitleaks did not produce a readable JSON report.' }
        $parsedReport = $reportText | ConvertFrom-Json
        $findings = @($parsedReport | ForEach-Object { $_ })

        Write-Host "Audited history boundary: HEAD $head across $commitCount commit(s)."

        if ($findings.Count -gt 0) {
            $summary = $findings |
                Select-Object RuleID, File, StartLine, Commit |
                Sort-Object File, StartLine |
                Format-Table -AutoSize |
                Out-String
            Write-Host $summary
            throw "Gitleaks found $($findings.Count) redacted historical finding(s). The publication history is not releasable."
        }
    }

    Write-Host 'Publication boundary validation passed.'
}
finally {
    Pop-Location
}
