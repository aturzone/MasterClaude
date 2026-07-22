# SKULL QA one-time Windows setup. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File tools/scripts/bootstrap.ps1
$ErrorActionPreference = "Stop"

Write-Host "== SKULL QA bootstrap ==" -ForegroundColor Cyan

# 1. Long paths (the monorepo + Playwright browser paths get deep).
git config core.longpaths true
Write-Host "  git core.longpaths = true"

# 2. corepack / pnpm
corepack enable
Write-Host "  corepack enabled"

# 3. .env from the template (never overwrite an existing one)
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "  created .env from .env.example — fill in your secrets" -ForegroundColor Yellow
} else {
  Write-Host "  .env already exists (left untouched)"
}

# 4. Install deps + the Chromium browser
pnpm install
pnpm --filter '@mc-qa-app/*' exec playwright install chromium

# 5. Docker check (needed only for the visual + sidecar lanes)
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  Write-Host "  docker found: $((docker --version))"
} else {
  Write-Host "  docker NOT found — install Docker Desktop (WSL2 backend) for the visual/security lanes" -ForegroundColor Yellow
}

Write-Host "`nDone. Try:  pnpm qa validate --service example" -ForegroundColor Green
