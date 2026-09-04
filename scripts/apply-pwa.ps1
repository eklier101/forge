# Copy PWA assets into the exported Expo web bundle and inject install/offline tags.
# Runs from publish-apk.ps1, and standalone when only the web shell changed.
# Keep this file ASCII-only: Windows PowerShell reads .ps1 as ANSI without a BOM.
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$Version
)

$ErrorActionPreference = "Stop"

if (-not $Version) {
  $Version = ([System.IO.File]::ReadAllText((Join-Path $Root "VERSION"))).Trim().Trim([char]0xFEFF)
}

$pwaSrc = Join-Path $Root "services\api\public\pwa"
$webDest = Join-Path $Root "services\api\public\app"
if (-not (Test-Path $webDest)) {
  throw "Web export not found at $webDest. Run 'npx expo export --platform web' first."
}

$utf8 = New-Object System.Text.UTF8Encoding $false

$manifest = Join-Path $pwaSrc "manifest.webmanifest"
if (Test-Path $manifest) {
  Copy-Item -Force $manifest (Join-Path $webDest "manifest.webmanifest")
}

$icons = Join-Path $pwaSrc "icons"
if (Test-Path $icons) {
  $iconsDest = Join-Path $webDest "icons"
  New-Item -ItemType Directory -Force -Path $iconsDest | Out-Null
  Copy-Item -Force (Join-Path $icons "*") $iconsDest
}

# Cache names carry the app version so a publish retires the previous bundle.
$swSrc = Join-Path $pwaSrc "sw.js"
if (Test-Path $swSrc) {
  $sw = [System.IO.File]::ReadAllText($swSrc).Replace("__FORGE_VERSION__", $Version)
  [System.IO.File]::WriteAllText((Join-Path $webDest "sw.js"), $sw, $utf8)
}

$swScript = "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/app/sw.js?v=" + $Version + "',{scope:'/app/'}).catch(function(){});});}</script>"
$pwaTags = @(
  '<link rel="manifest" href="/app/manifest.webmanifest"/>',
  '<meta name="theme-color" content="#0B1210"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>',
  '<meta name="apple-mobile-web-app-title" content="Forge"/>',
  '<link rel="apple-touch-icon" href="/app/icons/icon-180.png"/>',
  $swScript
) -join "`n"

$patched = 0
Get-ChildItem -Path $webDest -Filter "*.html" -Recurse | ForEach-Object {
  $html = [System.IO.File]::ReadAllText($_.FullName)
  # Strip a previous injection so re-runs do not stack stale versions.
  $html = [regex]::Replace($html, '<link rel="manifest" href="/app/manifest\.webmanifest"/>[\s\S]*?</script>', '')
  if ($html -match '(?i)</head>') {
    $html = [regex]::Replace($html, '(?i)</head>', ($pwaTags + "</head>"), 1)
    [System.IO.File]::WriteAllText($_.FullName, $html, $utf8)
    $patched++
  }
}

Write-Host "PWA applied to $patched HTML files (v$Version)"
