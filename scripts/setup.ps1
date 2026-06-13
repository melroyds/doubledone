# Idempotent one-time setup (Windows / PowerShell). Safe to re-run.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "Activating the pre-commit Inspector..."
git config core.hooksPath .githooks
Write-Host ("  core.hooksPath = " + (git config core.hooksPath))

if (Test-Path package.json) {
  Write-Host "Installing dependencies..."
  npm install
}

if (Get-Command gitleaks -ErrorAction SilentlyContinue) {
  Write-Host ("gitleaks present: " + (gitleaks version))
} else {
  Write-Host "gitleaks not found - install it for the secret-scan backstop:"
  Write-Host "    winget install Gitleaks.Gitleaks"
}

Write-Host "Setup complete - commits are now gated by .githooks/pre-commit."
