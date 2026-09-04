# Bump Forge app version for a new APK revision.
# Usage:
#   .\scripts\bump-version.ps1           # patch 0.2.0 -> 0.2.1
#   .\scripts\bump-version.ps1 minor
#   .\scripts\bump-version.ps1 major

param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Part = "patch"
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
$root = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $root "VERSION"
$appJsonPath = Join-Path $root "apps\mobile\app.json"
$pkgMobile = Join-Path $root "apps\mobile\package.json"

$current = ([System.IO.File]::ReadAllText($versionFile)).Trim().Trim([char]0xFEFF)
if ($current -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
  throw "VERSION must be semver (got '$current')"
}
$major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
switch ($Part) {
  "major" { $major++; $minor = 0; $patch = 0 }
  "minor" { $minor++; $patch = 0 }
  "patch" { $patch++ }
}
$next = "$major.$minor.$patch"

$appText = [System.IO.File]::ReadAllText($appJsonPath).TrimStart([char]0xFEFF)
$app = $appText | ConvertFrom-Json
$prevCode = [int]($app.expo.android.versionCode)
if ($prevCode -lt 1) { $prevCode = 1 }
$nextCode = $prevCode + 1

$app.expo.version = $next
$app.expo.android.versionCode = $nextCode
$app.expo.ios.buildNumber = [string]$nextCode
if (-not $app.expo.extra) {
  $app.expo | Add-Member -NotePropertyName extra -NotePropertyValue ([pscustomobject]@{})
}
$app.expo.extra.forgeVersion = $next
$app.expo.extra.forgeBuild = $nextCode

# Keep compact valid JSON without BOM
$json = $app | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($versionFile, $next, $utf8)
[System.IO.File]::WriteAllText($appJsonPath, $json + "`n", $utf8)

$apiVersion = Join-Path $root "services\api\VERSION"
[System.IO.File]::WriteAllText($apiVersion, $next, $utf8)
$apiCode = Join-Path $root "services\api\VERSION_CODE"
[System.IO.File]::WriteAllText($apiCode, [string]$nextCode, $utf8)
$apiCode = Join-Path $root "services\api\VERSION_CODE"
[System.IO.File]::WriteAllText($apiCode, [string]$nextCode, $utf8)

$mobilePkgText = [System.IO.File]::ReadAllText($pkgMobile).TrimStart([char]0xFEFF)
$mobilePkg = $mobilePkgText | ConvertFrom-Json
$mobilePkg.version = $next
[System.IO.File]::WriteAllText($pkgMobile, (($mobilePkg | ConvertTo-Json -Depth 20) + "`n"), $utf8)

# Keep native Android version in sync (assembleRelease reads build.gradle, not app.json)
$gradlePath = Join-Path $root "apps\mobile\android\app\build.gradle"
if (Test-Path $gradlePath) {
  $gradle = [System.IO.File]::ReadAllText($gradlePath)
  $gradle = [regex]::Replace($gradle, 'versionCode\s+\d+', "versionCode $nextCode")
  $gradle = [regex]::Replace($gradle, 'versionName\s+"[^"]*"', ('versionName "{0}"' -f $next))
  [System.IO.File]::WriteAllText($gradlePath, $gradle, $utf8)
  Write-Host "Synced android/app/build.gradle -> versionName $next / versionCode $nextCode"
}

Write-Host "Bumped to $next (android versionCode $nextCode)"

# Stub changelog entry if missing so What's New never goes silent again
$changelogPath = Join-Path $root "services\api\public\changelog.json"
try {
  $list = @()
  if (Test-Path $changelogPath) {
    $list = @(Get-Content $changelogPath -Raw | ConvertFrom-Json)
  }
  $exists = $false
  foreach ($e in $list) {
    if ($e.version -eq $next) { $exists = $true; break }
  }
  if (-not $exists) {
    $today = Get-Date -Format "yyyy-MM-dd"
    $entry = [pscustomobject]@{
      version = $next
      date = $today
      notes = @("Update published - edit this note in services/api/public/changelog.json before ship")
    }
    $list = @($entry) + @($list)
    [System.IO.File]::WriteAllText($changelogPath, (($list | ConvertTo-Json -Depth 6) + "`n"), $utf8)
    Write-Host "Stubbed changelog entry for $next - replace the placeholder note before publish."
  }
} catch {
  Write-Host "WARN: could not stub changelog.json - add notes manually for $next"
}

Write-Host "Add/edit improvement notes for $next in services/api/public/changelog.json before publish."
Write-Host "Next: .\scripts\publish-apk.ps1 -SkipBump -Channel early -Deploy   (or -Channel stable)"
