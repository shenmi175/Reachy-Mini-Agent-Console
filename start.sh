#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
REACHY_LAB_DIR="${REACHY_LAB_DIR:-$HOME/code/reachy-agent-lab}"
REACHY_DESKTOP_APP_DIR="${REACHY_DESKTOP_APP_DIR:-$HOME/code/reachy-mini-desktop-app}"
REACHY_DAEMON_VENV="${REACHY_DAEMON_VENV:-$ROOT_DIR/.venv-reachy-daemon}"
REACHY_DAEMON_INSTALL_SPEC="${REACHY_DAEMON_INSTALL_SPEC:-reachy-mini[mujoco]}"
LOG_DIR="$ROOT_DIR/logs"
FRONTEND_ROBOT_ASSETS_DIR="$FRONTEND_DIR/public/robot-3d"

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8710}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
REACHY_HOST="${REACHY_HOST:-127.0.0.1}"
REACHY_PORT="${REACHY_PORT:-8001}"
REACHY_SIM_MODE="${REACHY_SIM_MODE:-mujoco-headless}"
START_REACHY_DAEMON="${START_REACHY_DAEMON:-1}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-1}"
AUTO_COPY_ROBOT_ASSETS="${AUTO_COPY_ROBOT_ASSETS:-1}"

STARTED_PIDS=()

usage() {
  cat <<EOF
Usage: ./start.sh [all|x11|app|backend|frontend|daemon|daemon-x11|status]

Defaults:
  backend:  http://$BACKEND_HOST:$BACKEND_PORT
  frontend: http://$FRONTEND_HOST:$FRONTEND_PORT
  daemon:   http://$REACHY_HOST:$REACHY_PORT

Environment:
  REACHY_LAB_DIR=~/code/reachy-agent-lab
  REACHY_DESKTOP_APP_DIR=~/code/reachy-mini-desktop-app
  REACHY_DAEMON_VENV=$REACHY_DAEMON_VENV
  REACHY_DAEMON_INSTALL_SPEC='reachy-mini[mujoco]'
  REACHY_SIM_MODE=mujoco-headless | mujoco-gui | mockup | none
  MUJOCO_GL=glfw | egl | osmesa
  GLFW_PLATFORM=x11
  GDK_BACKEND=x11
  QT_QPA_PLATFORM=xcb
  START_REACHY_DAEMON=0 skips daemon startup
  AUTO_INSTALL_DEPS=0 skips automatic pip/npm install
  AUTO_COPY_ROBOT_ASSETS=0 skips copying missing 3D assets from the desktop app clone

Examples:
  ./start.sh
  ./start.sh x11
  ./start.sh daemon-x11
  REACHY_SIM_MODE=mujoco-gui ./start.sh
  REACHY_SIM_MODE=mockup ./start.sh
  MUJOCO_GL=osmesa ./start.sh daemon
EOF
}

log() {
  printf '[reachy-console] %s\n' "$*"
}

is_port_listening() {
  local port_hex
  port_hex="$(printf '%04X' "$1")"
  awk -v port="$port_hex" '
    NR > 1 {
      split($2, address, ":")
      if (toupper(address[2]) == port && $4 == "0A") {
        found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local timeout="${3:-30}"
  local elapsed=0
  while ! is_port_listening "$port"; do
    if (( elapsed >= timeout )); then
      log "$name did not open port $port within ${timeout}s"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  log "$name is listening on port $port"
}

http_contains() {
  local url="$1"
  local needle="$2"

  command -v curl >/dev/null 2>&1 || return 1
  curl -fsS --max-time 2 "$url" 2>/dev/null | grep -Fq "$needle"
}

backend_healthy() {
  http_contains "http://$BACKEND_HOST:$BACKEND_PORT/api/health" "reachy-agent-console"
}

frontend_healthy() {
  http_contains "http://$FRONTEND_HOST:$FRONTEND_PORT/" "Reachy Agent Console"
}

cleanup() {
  if ((${#STARTED_PIDS[@]} == 0)); then
    return
  fi
  log "stopping processes started by this script"
  for pid in "${STARTED_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

python_venv_hint() {
  local venv_package
  venv_package="$(python3 -c 'import sys; print(f"python{sys.version_info.major}.{sys.version_info.minor}-venv")' 2>/dev/null || printf 'python3-venv')"
  log "Python venv support is unavailable because ensurepip is missing"
  log "install it once with: sudo apt install $venv_package"
  log "then rerun ./start.sh"
}

python_dev_package() {
  python3 -c 'import sys; print(f"python{sys.version_info.major}.{sys.version_info.minor}-dev")' 2>/dev/null || printf 'python3-dev'
}

reachy_daemon_native_deps_hint() {
  local python_dev
  python_dev="$(python_dev_package)"
  log "Reachy daemon native dependencies are missing for PyGObject/pycairo"
  log "install them once with: sudo apt install pkg-config libcairo2-dev libgirepository1.0-dev gobject-introspection gir1.2-gtk-3.0 $python_dev build-essential"
  log "or skip the optional daemon with: START_REACHY_DAEMON=0 ./start.sh"
}

ensure_reachy_daemon_native_deps() {
  local missing=0

  if ! command -v pkg-config >/dev/null 2>&1; then
    missing=1
  elif ! pkg-config --exists cairo >/dev/null 2>&1; then
    missing=1
  elif ! pkg-config --exists gobject-introspection-1.0 >/dev/null 2>&1; then
    missing=1
  fi

  if (( missing )); then
    reachy_daemon_native_deps_hint
    return 1
  fi
}

ensure_python_venv() {
  local venv_dir="$1"
  local label="$2"

  if [[ -x "$venv_dir/bin/python" && -x "$venv_dir/bin/pip" ]]; then
    return
  fi

  if [[ "$AUTO_INSTALL_DEPS" == "0" ]]; then
    log "$label virtualenv missing or incomplete and AUTO_INSTALL_DEPS=0"
    return 1
  fi

  if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
    python_venv_hint
    return 1
  fi

  if [[ -x "$venv_dir/bin/python" && ! -x "$venv_dir/bin/pip" ]]; then
    log "$label virtualenv is incomplete; retrying creation"
  else
    log "creating $label virtualenv: $venv_dir"
  fi

  if ! python3 -m venv "$venv_dir"; then
    python_venv_hint
    return 1
  fi

  if [[ ! -x "$venv_dir/bin/python" || ! -x "$venv_dir/bin/pip" ]]; then
    log "$label virtualenv is incomplete after creation"
    python_venv_hint
    return 1
  fi
}

ensure_backend_env() {
  ensure_python_venv "$BACKEND_DIR/.venv" "backend" || return 1

  local requirements_hash
  local stamp_file="$BACKEND_DIR/.venv/.requirements.sha256"
  requirements_hash="$(sha256sum "$BACKEND_DIR/requirements.txt" | awk '{print $1}')"

  if ! "$BACKEND_DIR/.venv/bin/python" -c "import fastapi" >/dev/null 2>&1 \
    || [[ ! -f "$stamp_file" ]] \
    || [[ "$(cat "$stamp_file")" != "$requirements_hash" ]]; then
    if [[ "$AUTO_INSTALL_DEPS" == "0" ]]; then
      log "backend requirements need install but AUTO_INSTALL_DEPS=0"
      return 1
    fi
    log "installing backend requirements"
    "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt" || return 1
    printf '%s\n' "$requirements_hash" >"$stamp_file"
  fi
}

ensure_frontend_env() {
  local stamp_file="$FRONTEND_DIR/node_modules/.package-inputs.sha256"
  local package_hash
  if [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
    package_hash="$(sha256sum "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json" | sha256sum | awk '{print $1}')"
  else
    package_hash="$(sha256sum "$FRONTEND_DIR/package.json" | awk '{print $1}')"
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]] \
    || [[ ! -f "$stamp_file" ]] \
    || [[ "$(cat "$stamp_file")" != "$package_hash" ]]; then
    if [[ "$AUTO_INSTALL_DEPS" == "0" ]]; then
      log "frontend dependencies need install but AUTO_INSTALL_DEPS=0"
      return 1
    fi
    log "installing frontend dependencies"
    (cd "$FRONTEND_DIR" && npm install) || return 1
    printf '%s\n' "$package_hash" >"$stamp_file"
  fi
}

ensure_robot_assets() {
  if [[ -f "$FRONTEND_ROBOT_ASSETS_DIR/reachy-mini.urdf" ]]; then
    return
  fi

  if [[ "$AUTO_COPY_ROBOT_ASSETS" == "0" ]]; then
    log "3D assets missing and AUTO_COPY_ROBOT_ASSETS=0"
    return
  fi

  local source_dir="$REACHY_DESKTOP_APP_DIR/src/assets/robot-3d"
  if [[ ! -f "$source_dir/reachy-mini.urdf" ]]; then
    log "3D assets missing; clone official app or set REACHY_DESKTOP_APP_DIR"
    log "expected: $source_dir"
    return
  fi

  log "copying Reachy Mini 3D assets from $source_dir"
  mkdir -p "$FRONTEND_DIR/public"
  cp -a "$source_dir" "$FRONTEND_ROBOT_ASSETS_DIR"
}

reachy_daemon_install_source() {
  if [[ -f "$REACHY_LAB_DIR/pyproject.toml" || -f "$REACHY_LAB_DIR/setup.py" || -f "$REACHY_LAB_DIR/setup.cfg" ]]; then
    printf 'local:%s\n' "$REACHY_LAB_DIR"
  else
    printf 'pypi:%s\n' "$REACHY_DAEMON_INSTALL_SPEC"
  fi
}

ensure_reachy_daemon_env() {
  if [[ "$AUTO_INSTALL_DEPS" == "0" && ! -x "$REACHY_DAEMON_VENV/bin/reachy-mini-daemon" ]]; then
    log "Reachy daemon virtualenv missing and AUTO_INSTALL_DEPS=0"
    return 1
  fi

  ensure_python_venv "$REACHY_DAEMON_VENV" "Reachy daemon" || return 1

  local install_source
  local stamp_file="$REACHY_DAEMON_VENV/.install-source"
  install_source="$(reachy_daemon_install_source)"

  if [[ -x "$REACHY_DAEMON_VENV/bin/reachy-mini-daemon" ]] \
    && [[ -f "$stamp_file" ]] \
    && [[ "$(cat "$stamp_file")" == "$install_source" ]]; then
    return
  fi

  if [[ "$AUTO_INSTALL_DEPS" == "0" ]]; then
    log "Reachy daemon dependencies need install but AUTO_INSTALL_DEPS=0"
    return 1
  fi

  ensure_reachy_daemon_native_deps || return 1

  if [[ "$install_source" == local:* ]]; then
    local source_dir="${install_source#local:}"
    log "installing Reachy daemon from local source: $source_dir"
    "$REACHY_DAEMON_VENV/bin/pip" install -e "$source_dir[mujoco]" || return 1
  else
    local package_spec="${install_source#pypi:}"
    log "installing Reachy daemon package: $package_spec"
    "$REACHY_DAEMON_VENV/bin/pip" install "$package_spec" || return 1
  fi

  if [[ ! -x "$REACHY_DAEMON_VENV/bin/reachy-mini-daemon" ]]; then
    log "reachy-mini-daemon was not installed in $REACHY_DAEMON_VENV"
    return 1
  fi

  printf '%s\n' "$install_source" >"$stamp_file"
}

start_daemon() {
  if [[ "$START_REACHY_DAEMON" == "0" || "$REACHY_SIM_MODE" == "none" ]]; then
    log "daemon startup skipped"
    return
  fi

  if is_port_listening "$REACHY_PORT"; then
    log "port $REACHY_PORT is already listening; assuming Reachy daemon is running"
    return
  fi

  local daemon_bin
  local daemon_workdir="$ROOT_DIR"
  if [[ -x "$REACHY_LAB_DIR/.venv/bin/reachy-mini-daemon" ]]; then
    daemon_bin="$REACHY_LAB_DIR/.venv/bin/reachy-mini-daemon"
    daemon_workdir="$REACHY_LAB_DIR"
  else
    ensure_reachy_daemon_env || return 1
    daemon_bin="$REACHY_DAEMON_VENV/bin/reachy-mini-daemon"
    if [[ -d "$REACHY_LAB_DIR" ]]; then
      daemon_workdir="$REACHY_LAB_DIR"
    fi
  fi

  mkdir -p "$LOG_DIR"
  local daemon_log="$LOG_DIR/reachy-daemon.log"
  local mode_args=()

  case "$REACHY_SIM_MODE" in
    mujoco-headless)
      mode_args=(--sim --headless --no-media)
      export MUJOCO_GL="${MUJOCO_GL:-egl}"
      ;;
    mujoco-gui|mujoco-x11)
      mode_args=(--sim --no-media)
      export GLFW_PLATFORM="${GLFW_PLATFORM:-x11}"
      export GDK_BACKEND="${GDK_BACKEND:-x11}"
      export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-xcb}"
      export MUJOCO_GL="${MUJOCO_GL:-glfw}"
      ;;
    mockup)
      mode_args=(--mockup-sim --headless --no-media)
      ;;
    *)
      log "unknown REACHY_SIM_MODE: $REACHY_SIM_MODE"
      return 1
      ;;
  esac

  log "starting Reachy daemon ($REACHY_SIM_MODE), log: $daemon_log"
  (
    cd "$daemon_workdir"
    exec "$daemon_bin" \
      "${mode_args[@]}" \
      --fastapi-host "$REACHY_HOST" \
      --fastapi-port "$REACHY_PORT" \
      --log-file "$daemon_log"
  ) >>"$daemon_log" 2>&1 &
  local daemon_pid="$!"
  STARTED_PIDS+=("$daemon_pid")

  if ! wait_for_port "$REACHY_PORT" "Reachy daemon" 45; then
    if kill -0 "$daemon_pid" 2>/dev/null; then
      kill "$daemon_pid" 2>/dev/null || true
    fi
    log "daemon log tail:"
    tail -n 60 "$daemon_log" || true
    return 1
  fi
}

start_optional_daemon() {
  if ! start_daemon; then
    log "Reachy daemon was not started; continuing with backend/frontend"
    log "robot controls will use mock mode unless a daemon is already available at $REACHY_HOST:$REACHY_PORT"
  fi
}

start_backend() {
  if is_port_listening "$BACKEND_PORT"; then
    if backend_healthy; then
      log "backend is already healthy on port $BACKEND_PORT"
      return
    fi
    log "port $BACKEND_PORT is already listening, but it does not look like this backend"
    log "free that port or set BACKEND_PORT to a different value"
    return 1
  fi

  ensure_backend_env || return 1
  mkdir -p "$LOG_DIR"
  local backend_log="$LOG_DIR/backend.log"
  log "starting backend, log: $backend_log"
  (
    cd "$BACKEND_DIR"
    exec .venv/bin/uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) >>"$backend_log" 2>&1 &
  STARTED_PIDS+=("$!")

  wait_for_port "$BACKEND_PORT" "backend" 30 || return 1
}

start_frontend() {
  if is_port_listening "$FRONTEND_PORT"; then
    if frontend_healthy; then
      log "frontend is already healthy on port $FRONTEND_PORT"
      return
    fi
    log "port $FRONTEND_PORT is already listening, but it does not look like this frontend"
    log "free that port or set FRONTEND_PORT to a different value"
    return 1
  fi

  ensure_robot_assets
  ensure_frontend_env || return 1
  mkdir -p "$LOG_DIR"
  local frontend_log="$LOG_DIR/frontend.log"
  log "starting frontend, log: $frontend_log"
  (
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) >>"$frontend_log" 2>&1 &
  STARTED_PIDS+=("$!")

  wait_for_port "$FRONTEND_PORT" "frontend" 30 || return 1
}

connect_backend_to_robot() {
  if command -v curl >/dev/null 2>&1 && is_port_listening "$BACKEND_PORT"; then
    curl -fsS -X POST "http://$BACKEND_HOST:$BACKEND_PORT/api/robot/connect" >/dev/null 2>&1 || true
  fi
}

status() {
  for service in \
    "daemon:$REACHY_PORT" \
    "backend:$BACKEND_PORT" \
    "frontend:$FRONTEND_PORT"; do
    local name="${service%%:*}"
    local port="${service##*:}"
    if ! is_port_listening "$port"; then
      printf '%-8s not listening on 127.0.0.1:%s\n' "$name" "$port"
    elif [[ "$name" == "backend" ]] && backend_healthy; then
      printf '%-8s healthy on 127.0.0.1:%s\n' "$name" "$port"
    elif [[ "$name" == "frontend" ]] && frontend_healthy; then
      printf '%-8s healthy on 127.0.0.1:%s\n' "$name" "$port"
    elif [[ "$name" == "backend" || "$name" == "frontend" ]]; then
      printf '%-8s listening but unhealthy on 127.0.0.1:%s\n' "$name" "$port"
    else
      printf '%-8s listening on 127.0.0.1:%s\n' "$name" "$port"
    fi
  done
}

main() {
  local target="${1:-all}"

  case "$target" in
    all)
      start_optional_daemon
      start_backend
      start_frontend
      connect_backend_to_robot
      ;;
    x11)
      REACHY_SIM_MODE="mujoco-gui"
      start_optional_daemon
      start_backend
      start_frontend
      connect_backend_to_robot
      ;;
    app)
      start_backend
      start_frontend
      connect_backend_to_robot
      ;;
    backend)
      start_backend
      ;;
    frontend)
      start_frontend
      ;;
    daemon)
      start_daemon
      connect_backend_to_robot
      ;;
    daemon-x11)
      REACHY_SIM_MODE="mujoco-gui"
      start_daemon
      connect_backend_to_robot
      ;;
    status)
      status
      return
      ;;
    -h|--help|help)
      usage
      return
      ;;
    *)
      usage
      return 1
      ;;
  esac

  log "frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"
  log "backend:  http://$BACKEND_HOST:$BACKEND_PORT"
  log "daemon:   http://$REACHY_HOST:$REACHY_PORT"
  log "press Ctrl-C to stop processes started by this script"
  wait
}

main "$@"
