# MASTER CLAUDE QA nightly job (point Windows Task Scheduler here).
# Re-verifies selector health and runs the unattended public suite in Docker.
#   powershell -ExecutionPolicy Bypass -File tools/scripts/nightly.ps1 -Service example
param(
  [string]$Service = "example",
  [string]$Env = "production.test-account"
)
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..\..")

Write-Host "== nightly: $Service / $Env =="

# 1. Selector health (heals nothing; flags entries below 0.6 stability).
pnpm qa verify-selectors --service $Service --env $Env

# 2. Unattended run of class-a/b tasks in Docker (deterministic).
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  pnpm qa run --service $Service --env $Env --risk a,b --docker
} else {
  Write-Host "docker not found — running on host (no visual baselines)" -ForegroundColor Yellow
  pnpm qa run --service $Service --env $Env --risk a,b
}

# 3. Refresh the coverage dashboard.
pnpm qa dashboard --service $Service
