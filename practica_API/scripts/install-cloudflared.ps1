$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $root "tools"
$binaryPath = Join-Path $toolsDir "cloudflared.exe"
$downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

Write-Host "[Tunnel] Descargando cloudflared..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $binaryPath

Write-Host "[Tunnel] cloudflared instalado en $binaryPath"
