[CmdletBinding()]
param(
    [ValidateSet("basic", "power")]
    [string]$Profile = "basic",
    [switch]$Visual,
    [switch]$UpdateSnapshots,
    [switch]$Headed,
    [switch]$SkipPytest,
    [Alias("?")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

if ($Help) {
    Write-Host "Usage: .\scripts\run-local-tests.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Profile <basic|power>   Synthetic dataset profile (default: basic)"
    Write-Host "  -Visual                  Run visual regression suite instead of E2E smoke tests"
    Write-Host "  -UpdateSnapshots         With -Visual, update local visual baselines"
    Write-Host "  -Headed                  Run headed browser E2E (ignored when -Visual is set)"
    Write-Host "  -SkipPytest              Skip backend metric tests before E2E/visual tests"
    Write-Host "  -Help or -?              Show this help and exit without running tests"
    Write-Host ""
    Write-Host "Note: this script seeds the test DB and starts temporary backend/frontend processes."
    return
}

$env:PD_TEST_MODE = "1"
$env:PD_DATABASE_URL = "sqlite:///data/portfolio_test.db"
$env:NEXT_PUBLIC_API_URL = "http://localhost:8000/api"
$env:PW_BASE_URL = "http://localhost:3000"

# Use a fixed end date so optional visual snapshots are deterministic.
$SeedEndDate = "2025-12-31"

function Wait-Http {
    param(
        [Parameter(Mandatory=$true)][string]$Url,
        [int]$TimeoutSec = 90
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Timeout waiting for $Url"
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory=$true)][string]$Description,
        [Parameter(Mandatory=$true)][scriptblock]$Command
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE"
    }
}

$backendProc = $null
$frontendProc = $null

try {
    Write-Host "Seeding synthetic data profile '$Profile' into test DB..."
    Push-Location $BackendDir
    try {
        Invoke-Checked -Description "Seeding synthetic test data" -Command {
            python -m scripts.seed_test_data --profile $Profile --end-date $SeedEndDate
        }
    } finally {
        Pop-Location
    }

    if (-not $SkipPytest) {
        Write-Host "Running backend metric tests..."
        Push-Location $Root
        try {
            Invoke-Checked -Description "Backend metric tests" -Command {
                python -m pytest backend/tests/test_metrics.py -q
            }
        } finally {
            Pop-Location
        }
    }

    Write-Host "Starting backend..."
    $backendProc = Start-Process `
        -FilePath "python" `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $BackendDir `
        -PassThru
    Wait-Http -Url "http://localhost:8000/api/health"

    Write-Host "Starting frontend..."
    $frontendProc = Start-Process `
        -FilePath "npm" `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $FrontendDir `
        -PassThru
    Wait-Http -Url "http://localhost:3000"

    Push-Location $FrontendDir
    try {
        if ($Visual) {
            if ($UpdateSnapshots) {
                Write-Host "Running optional visual tests with snapshot update..."
                Invoke-Checked -Description "Visual tests (update snapshots)" -Command {
                    npm run test:visual:update
                }
            } else {
                Write-Host "Running optional visual tests..."
                Invoke-Checked -Description "Visual tests" -Command {
                    npm run test:visual
                }
            }
        } else {
            if ($Headed) {
                Write-Host "Running headed E2E smoke tests..."
                Invoke-Checked -Description "Headed E2E smoke tests" -Command {
                    npm run test:e2e:headed
                }
            } elseif ($Profile -eq "power") {
                Write-Host "Running power-profile E2E smoke tests..."
                Invoke-Checked -Description "Power-profile E2E smoke tests" -Command {
                    npm run test:e2e:power
                }
            } else {
                Write-Host "Running basic-profile E2E smoke tests..."
                Invoke-Checked -Description "Basic-profile E2E smoke tests" -Command {
                    npm run test:e2e:basic
                }
            }
        }
    } finally {
        Pop-Location
    }
}
finally {
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Stop-Process -Id $frontendProc.Id -Force
    }
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force
    }
}
