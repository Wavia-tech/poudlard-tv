#!/usr/bin/env bash
# Poudlard TV: every operation on the television, from the computer, over adb. Nothing here disables another app.
#   tools/tv.sh connect <ip>                 adb connect <ip>:5555
#   tools/tv.sh install [apk]                adb install -r (PoudlardTV.apk by default), then the TCL auto-start allowance
#   tools/tv.sh home poudlard                enable our HOME entry and make it the home (cmd package set-home-activity)
#   tools/tv.sh home original [pkg/activity] give the Home key back to the other home (found, or the one you name)
#   tools/tv.sh status                       HOME role holders, current default home, our .Home state, version
#   tools/tv.sh logs                         adb logcat, our tag and the WebView's
#   tools/tv.sh uninstall                    home original, then adb uninstall (uninstalling alone gives Home back too)
#   tools/tv.sh config pull|push             copy the launcher's configuration file from / to the TV (debuggable builds only)
# Every command prints what it runs first. ADB=echo tools/tv.sh ... shows the commands without running them.
# Installing never takes the Home key: our .Home alias ships disabled until "Faire de Poudlard l'accueil" (or home poudlard).
# The way back is `cmd package set-home-activity <the other home>`: `pm disable-user` on our alias is refused by Android 11.
set -euo pipefail

PKG=fr.wavia.poudlardtv
ADB="${ADB:-adb}"

run() { echo "+ $*" >&2; "$@"; }     # the trace goes to stderr, so that `config pull` writes only the file
shell() { run "$ADB" shell "$@"; }

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

other_homes() {
  # Every HOME activity except ours and FallbackHome (the "Android is starting" screen): the TV's own launcher, the
  # manufacturer's, and third-party launchers such as Free My TV (io.freemytv/.HomeActivity).
  "$ADB" shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME \
    | tr -d '\r' | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+' | grep -v "^$PKG/" | grep -v FallbackHome | sort -u
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
    echo "Installed. The Home key is unchanged: choose \"Faire de Poudlard l'accueil\" on the TV, or run: tools/tv.sh home poudlard"
    ;;
  home)
    case "${1:-}" in
      poudlard)
        shell pm enable "$PKG/.Home"
        shell cmd package set-home-activity "$PKG/.Home"
        ;;
      original)
        target="${2:-}"
        if [ -z "$target" ]; then
          homes="$(other_homes || true)"
          count="$(printf '%s\n' "$homes" | grep -c . || true)"
          if [ "$count" = "1" ]; then
            target="$homes"
          elif [ "$count" = "0" ]; then
            echo "No other home found on the TV. Uninstalling Poudlard TV (tools/tv.sh uninstall) gives Home back to the system."
            exit 1
          else
            echo "Several homes are installed; name the one to give the Home key to:"
            printf '  tools/tv.sh home original %s\n' $homes
            exit 1
          fi
        fi
        case "$target" in */*) ;; *) echo "Expected <package>/<activity>, for example io.freemytv/.HomeActivity"; exit 1 ;; esac
        shell cmd package set-home-activity "$target"
        ;;
      *) usage ;;
    esac
    ;;
  status)
    shell cmd role get-role-holders android.app.role.HOME || true
    shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME || true
    shell pm list packages -e "$PKG" || true
    shell dumpsys package "$PKG" | grep -E "versionName|versionCode|$PKG/.Home" || true
    shell cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.HOME || true
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
