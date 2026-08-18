[CmdletBinding()]
param(
    [string]$Solution = 'ZosyalMedya.sln'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path

function Find-VulnerabilityNode {
    param(
        [Parameter(Mandatory)]$Node,
        [string]$Path = '$'
    )

    if ($null -eq $Node -or $Node -is [string]) { return }

    if ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [pscustomobject]) {
        $index = 0
        foreach ($item in $Node) {
            if ($null -ne $item) { Find-VulnerabilityNode -Node $item -Path "$Path[$index]" }
            $index++
        }
        return
    }

    foreach ($property in $Node.PSObject.Properties) {
        $propertyPath = "$Path.$($property.Name)"
        if ($property.Name -eq 'vulnerabilities' -and @($property.Value).Count -gt 0) {
            [pscustomobject]@{ Path = $propertyPath; Vulnerabilities = $property.Value }
            continue
        }
        if ($null -ne $property.Value) {
            Find-VulnerabilityNode -Node $property.Value -Path $propertyPath
        }
    }
}

Push-Location -LiteralPath $workspace
try {
    $raw = & dotnet list $Solution package --vulnerable --include-transitive --format json
    if ($LASTEXITCODE -ne 0) { throw 'The NuGet vulnerability audit command failed.' }
    $report = ($raw -join "`n") | ConvertFrom-Json
    $findings = @(Find-VulnerabilityNode -Node $report)
    if ($findings.Count -gt 0) {
        $summary = $findings | ConvertTo-Json -Depth 20
        throw "NuGet vulnerability audit found $($findings.Count) affected package node(s):`n$summary"
    }
    Write-Host 'NuGet direct/transitive vulnerability audit passed.'
}
finally {
    Pop-Location
}
