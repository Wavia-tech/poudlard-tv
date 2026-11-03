<#
Poudlard TV: every operation on the television, from the computer, over adb (PowerShell twin of tv.sh).
  tools/tv.ps1 connect <ip>                 adb connect <ip>:5555
  tools/tv.ps1 install [apk]                adb install -r (PoudlardTV.apk by default), then the TCL auto-start allowance
  tools/tv.ps1 home poudlard                enable our HOME entry and make it the home (cmd package set-home-activity)
  tools/tv.ps1 home original [pkg/activity] give the Home key back to the other home (found, or the one you name)
  tools/tv.ps1 status                       HOME role holders, current default home, our .Home state, version
  tools/tv.ps1 logs                         adb logcat, our tag and the WebView's
  tools/tv.ps1 uninstall                    home original, then adb uninstall (uninstalling alone gives Home back too)
  tools/tv.ps1 config pull|push             copy the launcher's configuration file from / to the TV (debuggable builds only)
Every command prints what it runs first. $env:ADB = "echo" shows the commands without running them.
Installing never takes the Home key: our .Home alias ships disabled until "Faire de Poudlard l'accueil" (or home poudlard).
The way back is `cmd package set-home-activity <the other home>`: `pm disable-user` on our alias is refused by Android 11.
#>
param(
  [Parameter(Position = 0)][ValidateSet("connect", "install", "home", "status", "logs", "uninstall", "config")][string]$Command,
  [Parameter(Position = 1)][string]$Arg,
  [Parameter(Position = 2)][string]$Target
)
$ErrorActionPreference = "Stop"
$PKG = "fr.wavia.poudlardtv"
$ADB = if ($env:ADB) { $env:ADB } else { "adb" }

function Run {
  param([string[]]$Cmd)
  Write-Host ("+ " + ($Cmd -join " "))
  if ($Cmd.Length -gt 1) { $rest = $Cmd[1..($Cmd.Length - 1)]; & $Cmd[0] @rest } else { & $Cmd[0] }
}
function Shell { param([string]$Line) Run @($ADB, "shell", $Line) }

function Usage {
  Get-Content $PSCommandPath | Select-Object -Skip 1 -First 12
  exit 1
}

# Every HOME activity except ours and FallbackHome (the "Android is starting" screen): the TV's own launcher, the
# manufacturer's, and third-party launchers such as Free My TV (io.freemytv/.HomeActivity).
function OtherHomes {
  $out = & $ADB shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME
  $found = @()
  foreach ($m in ([regex]::Matches(($out -join "`n"), '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+'))) {
    $v = $m.Value
    if (-not $v.StartsWith("$PKG/") -and $v -notmatch "FallbackHome" -and $found -notcontains $v) { $found += $v }
  }
  return , $found
}

function HomeOriginal {
  param([string]$Name)
  if (-not $Name) {
    $homes = OtherHomes
    if ($homes.Count -eq 1) { $Name = $homes[0] }
    elseif ($homes.Count -eq 0) {
      Write-Host "No other home found on the TV. Uninstalling Poudlard TV (tools/tv.ps1 uninstall) gives Home back to the system."
      return $false
    }
    else {
      Write-Host "Several homes are installed; name the one to give the Home key to:"
      foreach ($h in ($homes | Sort-Object)) { Write-Host "  tools/tv.ps1 home original $h" }
      return $false
    }
  }
  if ($Name -notmatch "/") { Write-Host "Expected <package>/<activity>, for example io.freemytv/.HomeActivity"; return $false }
  Shell "cmd package set-home-activity $Name" | Out-Host
  return $true
}

switch ($Command) {
  "connect" { if (-not $Arg) { Usage }; Run @($ADB, "connect", "$Arg`:5555") }
  "install" {
    $apk = if ($Arg) { $Arg } else { "PoudlardTV.apk" }
    if (-not (Test-Path $apk)) { Write-Host "APK not found: $apk (build it with android/build.sh)"; exit 1 }
    Run @($ADB, "install", "-r", $apk)
    Shell "appops set $PKG AUTO_START allow || appops set $PKG APP_AUTO_START allow || true"
    Write-Host "Installed. The Home key is unchanged: choose `"Faire de Poudlard l'accueil`" on the TV, or run: tools/tv.ps1 home poudlard"
  }
  "home" {
    switch ($Arg) {
      "poudlard" { Shell "pm enable $PKG/.Home"; Shell "cmd package set-home-activity $PKG/.Home" }
      "original" { if (-not (HomeOriginal $Target)) { exit 1 } }
      default { Usage }
    }
  }
  "status" {
    Shell "cmd role get-role-holders android.app.role.HOME"
    Shell "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME"
    Shell "pm list packages -e $PKG"
    Shell "dumpsys package $PKG | grep -E 'versionName|versionCode|$PKG/.Home'"
    Shell "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME"
  }
  "logs" { Run @($ADB, "logcat", "-s", "PoudlardTV", "chromium") }
  "uninstall" { [void](HomeOriginal ""); Run @($ADB, "uninstall", $PKG) }
  "config" {
    $f = "files/poudlard-config.json"
    $local = Join-Path (Get-Location) "poudlard-config.json"
    switch ($Arg) {
      "pull" {
        $txt = (& $ADB shell "run-as $PKG cat $f") -join "`n"
        [IO.File]::WriteAllText($local, $txt, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "written poudlard-config.json"
      }
      "push" {
        if (-not (Test-Path $local)) { Write-Host "poudlard-config.json not found"; exit 1 }
        Run @($ADB, "push", $local, "/data/local/tmp/poudlard-config.json")
        Shell "run-as $PKG sh -c 'cat /data/local/tmp/poudlard-config.json > $f'"
      }
      default { Usage }
    }
  }
  default { Usage }
}
