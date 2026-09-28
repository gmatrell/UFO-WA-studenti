#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEFAULT_REPOSITORY="https://github.com/gmatrell/UFO-WA-studenti.git"
readonly REPOSITORY="${UFO_REPOSITORY:-$DEFAULT_REPOSITORY}"
readonly INSTALL_DIR="${UFO_INSTALL_DIR:-${HOME:?}/UFO-WA}"

log() {
  printf '[UFO] %s\n' "$*"
}

die() {
  printf '[UFO] Errore: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "comando richiesto non trovato: $1"
}

repository_identity() {
  local url="$1"
  url="${url%.git}"
  case "$url" in
    git@github.com:*)
      url="https://github.com/${url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      url="https://github.com/${url#ssh://git@github.com/}"
      ;;
  esac
  printf '%s\n' "${url%/}"
}

latest_release_tag() {
  local refs tag
  if ! refs="$(git ls-remote --tags --refs "$REPOSITORY")"; then
    die "impossibile interrogare il repository GitHub: $REPOSITORY"
  fi

  while read -r _ ref; do
    tag="${ref#refs/tags/}"
    if [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      printf '%s\n' "$tag"
    fi
  done <<< "$refs" | sort -V | tail -n 1
}

package_version() {
  local project_dir="$1" version
  if ! version="$(cd "$project_dir" && node -e \
    'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); process.stdout.write(String(pkg.version || ""));')"; then
    die "package.json non valido in $project_dir"
  fi
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
    die "versione non semver in $project_dir/package.json: $version"
  printf '%s\n' "$version"
}

version_is_greater() {
  local first="$1" second="$2"
  [[ "$first" != "$second" ]] &&
    [[ "$(printf '%s\n' "$first" "$second" | sort -V | tail -n 1)" == "$first" ]]
}

check_node_version() {
  node -e '
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 22) {
      console.error(`Node.js ${process.versions.node} non supportato: serve Node.js 22 o successivo.`);
      process.exit(1);
    }
  ' || exit 1
}

ensure_dependencies() {
  local lock_hash marker recorded_hash
  lock_hash="$(sha256sum "$INSTALL_DIR/package-lock.json" | awk '{print $1}')"
  marker="$INSTALL_DIR/node_modules/.ufo-package-lock.sha256"
  recorded_hash=''
  if [[ -f "$marker" ]]; then
    recorded_hash="$(<"$marker")"
  fi

  if [[ "$recorded_hash" != "$lock_hash" || ! -d "$INSTALL_DIR/node_modules/monaco-editor" || ! -d "$INSTALL_DIR/node_modules/netlistsvg" ]]; then
    log "Installazione delle dipendenze locali con npm ci --ignore-scripts..."
    (cd "$INSTALL_DIR" && npm ci --ignore-scripts)
    printf '%s\n' "$lock_hash" > "$marker"
  else
    log "Dipendenze locali già allineate al lockfile."
  fi
}

check_optional_tools() {
  local missing=()
  local tool
  for tool in ghdl yosys gtkwave; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing+=("$tool")
    fi
  done
  if ((${#missing[@]} > 0)); then
    log "Avviso: strumenti non trovati (le funzioni corrispondenti non saranno disponibili): ${missing[*]}"
  fi
}

ensure_workspace() {
  local workspace_root="${HOME:?}/Workspace"
  if [[ -e "$workspace_root" && ! -d "$workspace_root" ]]; then
    die "$workspace_root esiste ma non è una directory"
  fi
  if [[ ! -d "$workspace_root" ]]; then
    mkdir -p "$workspace_root"
    log "Creata la radice dei progetti: $workspace_root"
  fi
}

has_help_option() {
  local argument
  for argument in "$@"; do
    if [[ "$argument" == '--help' || "$argument" == '-h' ]]; then
      return 0
    fi
  done
  return 1
}

requested_port() {
  local port="${UFO_PORT:-8080}"
  local argument waiting_for_port=0
  for argument in "$@"; do
    if ((waiting_for_port)); then
      port="$argument"
      waiting_for_port=0
      continue
    fi
    case "$argument" in
      --port=*) port="${argument#--port=}" ;;
      --port) waiting_for_port=1 ;;
    esac
  done
  printf '%s\n' "$port"
}

wait_for_server() {
  local application_pid="$1" port="$2" attempt
  for ((attempt = 0; attempt < 100; attempt += 1)); do
    if ! kill -0 "$application_pid" 2>/dev/null; then
      return 1
    fi
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      exec 3>&-
      return 0
    fi
    sleep 0.1
  done
  return 1
}

open_browser() {
  local url="$1"
  if command -v wslview >/dev/null 2>&1; then
    wslview "$url" >/dev/null 2>&1 &
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v gio >/dev/null 2>&1; then
    gio open "$url" >/dev/null 2>&1 &
  else
    log "Browser non rilevato: apri manualmente $url"
    return 0
  fi
  log "Browser aperto su $url"
}

run_application() {
  local port="$1"
  shift
  local application_pid application_status=0
  local url="http://127.0.0.1:$port"

  (cd "$INSTALL_DIR" && exec npm start -- "$@") &
  application_pid=$!
  trap 'kill "$application_pid" 2>/dev/null || true' INT TERM

  if [[ "$port" =~ ^[0-9]+$ && "$port" -gt 0 ]] && wait_for_server "$application_pid" "$port"; then
    open_browser "$url"
  elif kill -0 "$application_pid" 2>/dev/null; then
    log "UFO è in avvio ma non riesco ad aprire automaticamente il browser; usa $url"
  else
    log "UFO non ha avviato il servizio su $url"
  fi

  wait "$application_pid" || application_status=$?
  trap - INT TERM
  return "$application_status"
}

require_command git
require_command node
require_command npm
require_command sha256sum
check_node_version

latest_tag="$(latest_release_tag)"
[[ -n "$latest_tag" ]] || die "nessun tag di release vX.Y.Z trovato in $REPOSITORY"
latest_version="${latest_tag#v}"

if [[ ! -e "$INSTALL_DIR" ]]; then
  log "UFO non installato: clono $latest_tag in $INSTALL_DIR."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --quiet --depth 1 --branch "$latest_tag" "$REPOSITORY" "$INSTALL_DIR" || \
    die "clone di UFO non riuscito"
elif [[ ! -e "$INSTALL_DIR/.git" ]]; then
  die "$INSTALL_DIR esiste ma non è un clone Git di UFO; non modifico la cartella"
else
  origin_url="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
  [[ -n "$origin_url" ]] || die "il clone esistente non ha un remote origin"
  [[ "$(repository_identity "$origin_url")" == "$(repository_identity "$REPOSITORY")" ]] || \
    die "il clone esistente punta a un repository diverso: $origin_url"

  worktree_status="$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=all)"
  [[ -z "$worktree_status" ]] || die "il clone contiene modifiche locali; aggiornamento annullato per non perderle"

  log "Controllo aggiornamenti GitHub..."
  git -C "$INSTALL_DIR" fetch --quiet --tags "$REPOSITORY" || \
    die "aggiornamento dei tag dal repository non riuscito"

  current_version="$(package_version "$INSTALL_DIR")"
  current_commit="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  target_commit="$(git -C "$INSTALL_DIR" rev-parse "${latest_tag}^{commit}")" || \
    die "il tag $latest_tag non è disponibile nel clone"

  if version_is_greater "$current_version" "$latest_version"; then
    log "La copia locale ($current_version) è più recente dell'ultima release pubblica ($latest_version); non effettuo il downgrade."
  elif [[ "$current_commit" != "$target_commit" ]]; then
    log "Aggiorno UFO da v$current_version a $latest_tag."
    git -C "$INSTALL_DIR" checkout --quiet --detach "$latest_tag" || \
      die "checkout della release $latest_tag non riuscito"
  else
    log "UFO è già aggiornato alla release $latest_tag."
  fi
fi

installed_version="$(package_version "$INSTALL_DIR")"
if ! version_is_greater "$installed_version" "$latest_version" && [[ "$installed_version" != "$latest_version" ]]; then
  die "la copia installata dichiara $installed_version, ma il tag selezionato è $latest_tag"
fi

ensure_dependencies
check_optional_tools
ensure_workspace

if has_help_option "$@"; then
  cd "$INSTALL_DIR"
  exec npm start -- "$@"
fi

port="$(requested_port "$@")"
log "Avvio UFO $installed_version."
run_application "$port" "$@"
