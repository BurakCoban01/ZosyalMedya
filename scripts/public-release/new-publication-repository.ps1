[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9][a-z0-9-]{2,62}$')]
    [string]$Name = 'public-rc'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$outputParent = Join-Path $repositoryRoot '.prv1-publication-output'
$safeOutputParent = [IO.Path]::GetFullPath($outputParent).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$outputPath = [IO.Path]::GetFullPath((Join-Path $outputParent $Name))
$archivePath = Join-Path $outputParent ("source-{0}.tar" -f [Guid]::NewGuid().ToString('N'))
$denyPaths = @(
    '.agents',
    '.codex',
    '.factory',
    'AGENTS.md',
    'CURRENT_FOCUS.md',
    'PLANS.md',
    'TASKS.md',
    'docs/agent',
    'docs/eski-agent-goals',
    'docs/task-evidence',
    'docs/tlmtlr',
    'docs/YararlanilabilirProje'
)

function Assert-OutputChild([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($safeOutputParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing publication-output operation outside $outputParent`: $resolved"
    }
}

function Test-DeniedRelativePath([string]$Path) {
    $normalized = $Path.Replace('\', '/').TrimEnd('/')
    return $denyPaths | Where-Object {
        $denied = $_.Replace('\', '/').TrimEnd('/')
        $normalized.Equals($denied, [StringComparison]::OrdinalIgnoreCase) -or
            $normalized.StartsWith("$denied/", [StringComparison]::OrdinalIgnoreCase)
    } | Select-Object -First 1
}

function Remove-SafeGeneratedPath([string]$Path) {
    Assert-OutputChild $Path
    if (-not (Test-Path -LiteralPath $Path)) { return }

    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        if ($item.PSIsContainer) { [IO.Directory]::Delete($item.FullName, $false) }
        else { [IO.File]::Delete($item.FullName) }
        return
    }

    if (-not $item.PSIsContainer) {
        $item.IsReadOnly = $false
        $item.Delete()
        return
    }

    foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force) {
        Remove-SafeGeneratedPath $child.FullName
    }
    [IO.Directory]::Delete($item.FullName, $false)
}

Push-Location -LiteralPath $repositoryRoot
try {
    Assert-OutputChild $outputPath
    if (Test-Path -LiteralPath $outputPath) {
        throw "Publication output already exists; inspect or remove it explicitly before retrying: $outputPath"
    }

    $changedTrackedPaths = @(& git -c diff.renames=false diff --name-only HEAD --)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect tracked working-tree changes.' }
    $changedPublishedPaths = @($changedTrackedPaths | Where-Object { -not (Test-DeniedRelativePath $_) })
    if ($changedPublishedPaths.Count -gt 0) {
        throw "Tracked changes in publication-eligible paths must be committed before exporting:`n$($changedPublishedPaths -join "`n")"
    }

    if (Test-Path -LiteralPath $outputParent) {
        $outputParentItem = Get-Item -LiteralPath $outputParent -Force
        if (($outputParentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Publication output parent cannot be a junction or symbolic link: $outputParent"
        }
    }
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
    New-Item -ItemType Directory -Path $outputPath | Out-Null
    $outputItem = Get-Item -LiteralPath $outputPath -Force
    if (($outputItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Publication output cannot be a junction or symbolic link: $outputPath"
    }
    try {
        $archiveArguments = @('archive', '--format=tar', "--output=$archivePath", 'HEAD', '--', '.')
        foreach ($relativePath in $denyPaths) {
            $archiveArguments += ":(exclude)$relativePath"
        }
        $archiveArguments += ':(exclude,glob)p0-*.png'
        & git @archiveArguments
        if ($LASTEXITCODE -ne 0) { throw 'git archive failed.' }
        & tar -xf $archivePath -C $outputPath
        if ($LASTEXITCODE -ne 0) { throw 'tar extraction failed.' }

        foreach ($relativePath in $denyPaths) {
            $target = Join-Path $outputPath $relativePath
            Assert-OutputChild $target
            if (Test-Path -LiteralPath $target) {
                Remove-SafeGeneratedPath $target
            }
        }
        foreach ($screenshot in Get-ChildItem -LiteralPath $outputPath -Filter 'p0-*.png' -File) {
            Remove-SafeGeneratedPath $screenshot.FullName
        }

        & git -C $outputPath init --quiet --initial-branch=main
        if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize sanitized publication history.' }
        & git -C $outputPath config user.name 'Enterprise Social Community Platform Release'
        & git -C $outputPath config user.email 'release@local.invalid'
        & git -C $outputPath add --all
        & git -C $outputPath commit --quiet -m 'Initial public release candidate'
        if ($LASTEXITCODE -ne 0) { throw 'Unable to create sanitized publication commit.' }

        & (Join-Path $PSScriptRoot 'validate-publication-boundary.ps1') -RepositoryPath $outputPath -ScanHistory
        if ($LASTEXITCODE -ne 0) { throw 'Sanitized publication validation failed.' }

        $commitCount = (& git -C $outputPath rev-list --count HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or $commitCount -ne '1') {
            throw "Sanitized publication history must contain exactly one commit; found $commitCount."
        }

        Write-Host "Sanitized local publication repository created: $outputPath"
        Write-Host 'No remote was configured and nothing was pushed or published.'
    }
    catch {
        if (Test-Path -LiteralPath $outputPath) {
            Remove-SafeGeneratedPath $outputPath
        }
        throw
    }
    finally {
        if (Test-Path -LiteralPath $archivePath) {
            Remove-Item -LiteralPath $archivePath -Force
        }
    }
}
finally {
    Pop-Location
}
