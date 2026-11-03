#!/usr/bin/env bash
# Poudlard TV: every operation on the television, from the computer, over adb. Nothing here touches another app.
#   tools/tv.sh connect <ip>        adb connect <ip>:5555
#   tools/tv.sh install [apk]       adb install -r (PoudlardTV.apk by default), then the TCL auto-start allowance
#   tools/tv.sh home poudlard       re-enable our HOME entry and make it the home (cmd package set-home-activity)
#   tools/tv.sh home original       make the TV's own home the home again and close our HOME entry
#   tools/tv.sh status              HOME role holders, our .Home component state, installed version
#   tools/tv.sh logs                adb logcat, our tag and the WebView's
#   tools/tv.sh uninstall           home original, then adb uninstall
#   tools/tv.sh config pull|push    copy the launcher's configuration file from / to the TV (debuggable builds only)
# Every command prints what it runs first. ADB=echo tools/tv.sh ... shows the commands without running them.
set -euo pipefail

PKG=fr.wavia.poudlardtv
ADB="${ADB:-adb}"

run() { echo "+ $*"; "$@"; }
shell() { run "$ADB" shell "$@"; }

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

stock_home() {
  # The TV's own home: the HOME activities minus ours and minus FallbackHome (the "Android is starting" screen).
  "$ADB" shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME \
    | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+' | grep -v "^$PKG/" | grep -v FallbackHome | head -1
}

cmd="${1:-}"; shift || true
case "$cmd" in
  connect)
    [ $# -ge 1 ] || usage
    run "$ADB" connect "$1:5555"
    ;;
  install)
    apk="${1:-PoudlardTV.apk}"
    [ -f "$apk" ] || { echo "APK not found: $apk (build it with android/build.sh)"; exit 1; }
    run "$ADB" install -r "$apk"
    # TCL: allow the home to run in the background (ignored elsewhere).
    shell "appops set $PKG AUTO_START allow || appops set $PKG APP_AUTO_START allow || true"
    ;;
  home)
    case "${1:-}" in
      poudlard)
        shell pm enable "$PKG/.Home"
        shell cmd package set-home-activity "$PKG/.Home"
        ;;
      original)
        stock="$(stock_home || true)"
        if [ -z "$stock" ]; then echo "The TV's own home could not be found: open Settings → Apps → Home on the TV."; exit 1; fi
        shell cmd package set-home-activity "$stock"
        shell pm disable-user --user 0 "$PKG/.Home"
        ;;
      *) usage ;;
    esac
    ;;
  status)
    shell cmd role get-role-holders android.app.role.HOME || true
    shell pm list packages -e "$PKG" || true
    shell dumpsys package "$PKG" | grep -E "versionName|$PKG/.Home" || true
    shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME || true
    ;;
  logs)
    run "$ADB" logcat -s PoudlardTV chromium
    ;;
  uninstall)
    "$0" home original || true
    run "$ADB" uninstall "$PKG"
    ;;
  config)
    f=files/poudlard-config.json
    case "${1:-}" in
      pull) shell "run-as $PKG cat $f" > poudlard-config.json && echo "written poudlard-config.json" ;;
      push) [ -f poudlard-config.json ] || { echo "poudlard-config.json not found"; exit 1; }
            run "$ADB" push poudlard-config.json /data/local/tmp/poudlard-config.json
            shell "run-as $PKG sh -c 'cat /data/local/tmp/poudlard-config.json > $f'" ;;
      *) usage ;;
    esac
    ;;
  *) usage ;;
esac
