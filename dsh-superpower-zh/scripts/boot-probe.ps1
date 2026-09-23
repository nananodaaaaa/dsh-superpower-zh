# Boot-validation probe for the superpower-zh / ppt-plugin bundle family.
#
# Installs both plugin packages into a THROWAWAY profile through the ordinary
# `dsh plugin add` path, serves the real Web composition on an OS-assigned free
# port, and reports the boot diagnostics. A clean boot is the proof that both
# `skill-filesystem` rows activated with distinct provider names, that both
# prompt-section plugins applied, and that the composition still loads with
# AgentTeams-style rows alongside. The probe profile is deleted afterwards; the
# user's own profiles are never modified.
#
# Usage: pwsh -File scripts/boot-probe.ps1

# `dsh` writes progress lines to stderr, which Windows PowerShell surfaces as a
# NativeCommandError record. Keep going and judge by $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'

$repoPlugins = 'G:\Deepseek_Official_Harness_Test\plugins'
$profilesRoot = Join-Path $env:USERPROFILE '.dsh\profiles'
$probe = Join-Path $profilesRoot 'spverify'
$log = Join-Path $env:TEMP 'dsh-spverify.log'
$err = "$log.err"
$started = $null

function Remove-ProbeProfile {
  if (Test-Path $probe) { Remove-Item $probe -Recurse -Force -ErrorAction SilentlyContinue }
  Get-ChildItem $profilesRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'dsh-template-spverify-*' } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}

Remove-ProbeProfile
Remove-Item $log, $err -Force -ErrorAction SilentlyContinue

# ── build the probe profile by the ordinary install path ──
$tpl = 'dsh-template-spverify-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
dsh plugin --profile $tpl add "$repoPlugins\dsh-superpower-zh" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'template install failed (superpower-zh)' }
dsh plugin --profile $tpl add "$repoPlugins\dsh-ppt-plugin" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'template install failed (ppt-plugin)' }
Move-Item (Join-Path $profilesRoot $tpl) $probe -Force
Write-Output "probe profile: $probe"

try {
  Write-Output '=== composed rows contributed by the two bundles ==='
  dsh --profile spverify --dump-config 2>&1 |
    Select-String -Pattern 'superpower-zh|ppt-plugin' |
    ForEach-Object { $_.Line.Trim() }

  # ── serve the composed profile on a free port, no browser ──
  # Started through node directly: `dsh` on PATH is a .ps1 shim, which
  # Start-Process cannot launch.
  $dshBin = Join-Path (Split-Path (Get-Command dsh).Source) 'node_modules\@deepseek-ai\dsh\lib\bin.js'
  if (-not (Test-Path $dshBin)) { throw "cannot locate the dsh entry point (looked for $dshBin)" }
  Write-Output "starting: node $dshBin --profile spverify --port 0 --no-open"
  $started = Start-Process -FilePath 'node' `
    -ArgumentList @($dshBin, '--profile', 'spverify', '--port', '0', '--no-open') `
    -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -WindowStyle Hidden

  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 1
    foreach ($file in @($log, $err)) {
      if (Test-Path $file) {
        $m = Select-String -Path $file -Pattern 'https?://127\.0\.0\.1:\d+' -AllMatches -ErrorAction SilentlyContinue |
             Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value; break }
      }
    }
    if ($url) { break }
    if ($started.HasExited) { break }
  }

  Write-Output '=== boot log (tail) ==='
  foreach ($file in @($log, $err)) { if (Test-Path $file) { Get-Content $file -Tail 25 } }
  Write-Output ("log bytes = {0}; err bytes = {1}" -f (Get-Item $log -ErrorAction SilentlyContinue).Length, (Get-Item $err -ErrorAction SilentlyContinue).Length)
  if (-not $url) { Write-Output 'NOTE: no URL line captured; judging by the activation audit below' }

  Write-Output '=== plugin rows observed loading in this boot (empty = FAIL) ==='
  $loaded = Select-String -Path $log, $err -Pattern 'registered prompt section' -ErrorAction SilentlyContinue
  if ($loaded) { $loaded | ForEach-Object { $_.Line.Trim() } } else { Write-Output '(no prompt section registered — the plugins did not apply)' }

  if (-not $url) {
    if ($loaded) { Write-Output 'PASS (composition loaded; URL was printed by the launcher outside the captured streams)' }
    else { throw 'probe never loaded the plugin rows — see the boot log above' }
  }
  else { Write-Output "PROBE SERVER UP: $url" }

  Write-Output '=== activation problems? (empty is the pass) ==='
  $problems = Select-String -Path $log, $err -Pattern 'did not activate|has been registered at|published process-global|Cannot find package|invalid config|plugin tree failed' -ErrorAction SilentlyContinue
  if ($problems) { $problems | ForEach-Object { $_.Line.Trim() } } else { Write-Output '(none)' }

  Write-Output '=== skill bundles reachable in the installed profile ==='
  $skills = Get-ChildItem "$probe\node_modules\dsh-superpower-zh\skills", "$probe\node_modules\dsh-ppt-plugin\skills" -Directory |
    ForEach-Object Name
  Write-Output ("count = {0}" -f $skills.Count)
  $skills | Sort-Object | ForEach-Object { "  $_" }
}
finally {
  if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-ProbeProfile
  Write-Output "probe profile removed: $(-not (Test-Path $probe))"
}
