#!/bin/bash
set -euo pipefail
plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
state_dir=${XDG_STATE_HOME:-$HOME/.local/state}/omarchy-elgato
rule_source=$plugin_dir/assets/udev/70-omarchy-elgato.rules
rule_target=/etc/udev/rules.d/70-omarchy-elgato.rules
missing=()
need_avahi=false
node_ok() { "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' > /dev/null 2>&1; }
if ! node_ok node && node_ok /usr/bin/node; then export PATH=/usr/bin:$PATH; fi
add_missing() {
  local package=$1 candidate
  for candidate in "${missing[@]}"; do [[ $candidate == "$package" ]] && return; done
  missing+=("$package")
}
check_system() {
  missing=()
  node_ok node || add_missing nodejs
  local command package
  while read -r command package; do
    command -v "$command" > /dev/null 2>&1 || add_missing "$package"
  done << 'PACKAGES'
npm npm
magick imagemagick
fc-match fontconfig
avahi-browse avahi
wpctl wireplumber
wtype wtype
uwsm-app uwsm
gtk-launch gtk3
xdg-open xdg-utils
PACKAGES
  if command -v fc-match > /dev/null 2>&1; then
    local font
    font=$(fc-match -f '%{file}' sans-serif 2> /dev/null) || font=''
    [[ -f ${OMARCHY_ELGATO_FONT:-$font} ]] || add_missing ttf-dejavu
  else
    add_missing ttf-dejavu
  fi
  need_avahi=false
  systemctl is-active --quiet avahi-daemon.service 2> /dev/null || need_avahi=true
  [[ ${#missing[@]} == 0 && $need_avahi == false ]] && cmp -s "$rule_source" "$rule_target"
}
write_state() {
  mkdir -p "$state_dir"
  local temporary
  temporary=$(mktemp "$state_dir/runtime-status.XXXXXX")
  jq -n --arg phase "$1" --arg message "$2" --arg error "${3:-}" \
    '{phase:$phase,message:$message,error:$error,updatedAt:(now|floor)}' > "$temporary"
  mv -- "$temporary" "$state_dir/runtime-status.json"
}
case ${1:-} in
  --check)
    if check_system; then exit 0; fi
    [[ ${#missing[@]} == 0 ]] || printf 'Missing packages: %s\n' "${missing[*]}"
    cmp -s "$rule_source" "$rule_target" || echo 'Stream Deck USB access needs setup.'
    [[ $need_avahi == false ]] || echo 'Avahi discovery service needs to be started.'
    exit 1
    ;;
  --request)
    write_state preparing 'Complete the requirements prompt in the terminal window.'
    if ! omarchy launch terminal bash "$plugin_dir/scripts/system-setup.sh" --install; then
      write_state failed '' 'Could not open the setup terminal. Run bin/omarchy-elgato install-requirements in a terminal.'
    fi
    ;;
  --install)
    mkdir -p "$state_dir"
    exec 8> "$state_dir/system-setup.lock"
    flock -n 8 || {
      echo 'Setup is already open in another terminal.'
      exit 0
    }
    complete=false
    cleanup() {
      if [[ $complete != true ]]; then
        write_state failed '' 'System setup was cancelled or failed. Use Retry setup to try again.'
      fi
    }
    trap cleanup EXIT
    if ! check_system; then
      echo 'Omarchy Elgato needs the following setup:'
      [[ ${#missing[@]} == 0 ]] || printf '  Install packages through Omarchy: %s\n' "${missing[*]}"
      cmp -s "$rule_source" "$rule_target" || echo '  Enable Stream Deck USB access for the active desktop user.'
      [[ $need_avahi == false ]] || echo '  Enable Avahi for Key Light discovery.'
      gum confirm 'Install these requirements? Administrator authentication may be requested.' || exit 1
      [[ ${#missing[@]} == 0 ]] || omarchy pkg add "${missing[@]}"
      if ! cmp -s "$rule_source" "$rule_target"; then
        sudo install -m 0644 -- "$rule_source" "$rule_target"
        sudo udevadm control --reload-rules
        sudo udevadm trigger --subsystem-match=hidraw --action=add
      fi
      [[ $need_avahi == false ]] || sudo systemctl enable --now avahi-daemon.service
      # Prefer a newly installed system Node over an outdated managed version.
      if ! node_ok node && node_ok /usr/bin/node; then export PATH=/usr/bin:$PATH; fi
      if ! check_system; then
        echo 'Requirements could not be satisfied. Check the installation output.'
        exit 1
      fi
    fi
    write_state ready 'Requirements installed. Reconnect the Stream Deck if it is not detected.'
    complete=true
    echo 'System requirements ready. Reconnect the Stream Deck if needed.'
    omarchy-shell dxun-dev.omarchy-elgato.runtime retry || {
      echo 'Enable the plugin through Omarchy to finish runtime preparation.'
    }
    ;;
  *)
    echo 'Usage: system-setup.sh --check|--request|--install' >&2
    exit 2
    ;;
esac
