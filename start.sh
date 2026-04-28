#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
REACHY_LAB_DIR="${REACHY_LAB_DIR:-$HOME/code/reachy-agent-lab}"
REACHY_DESKTOP_APP_DIR="${REACHY_DESKTOP_APP_DIR:-$HOME/code/reachy-mini-desktop-app}"
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

ensure_backend_env() {
  if [[ "$AUTO_INSTALL_DEPS" == "0" && ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    log "backend virtualenv missing and AUTO_INSTALL_DEPS=0"
    return 1
  fi

  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    log "creating backend virtualenv"
    python3 -m venv "$BACKEND_DIR/.venv"
  fi

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
    "$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
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
    (cd "$FRONTEND_DIR" && npm install)
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

start_daemon() {
  if [[ "$START_REACHY_DAEMON" == "0" || "$REACHY_SIM_MODE" == "none" ]]; then
    log "daemon startup skipped"
    return
  fi

  if is_port_listening "$REACHY_PORT"; then
    log "port $REACHY_PORT is already listening; assuming Reachy daemon is running"
    return
  fi

  if [[ ! -d "$REACHY_LAB_DIR/.venv" ]]; then
    log "Reachy lab virtualenv not found: $REACHY_LAB_DIR/.venv"
    return 1
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
    cd "$REACHY_LAB_DIR"
    source .venv/bin/activate
    exec reachy-mini-daemon \
      "${mode_args[@]}" \
      --fastapi-host "$REACHY_HOST" \
      --fastapi-port "$REACHY_PORT" \
      --log-file "$daemon_log"
  ) >>"$daemon_log" 2>&1 &
  STARTED_PIDS+=("$!")

  if ! wait_for_port "$REACHY_PORT" "Reachy daemon" 45; then
    log "daemon log tail:"
    tail -n 60 "$daemon_log" || true
    return 1
  fi
}

start_backend() {
  if is_port_listening "$BACKEND_PORT"; then
    log "port $BACKEND_PORT is already listening; backend not started again"
    return
  fi

  ensure_backend_env
  mkdir -p "$LOG_DIR"
  local backend_log="$LOG_DIR/backend.log"
  log "starting backend, log: $backend_log"
  (
    cd "$BACKEND_DIR"
    exec .venv/bin/uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
  ) >>"$backend_log" 2>&1 &
  STARTED_PIDS+=("$!")

  wait_for_port "$BACKEND_PORT" "backend" 30
}

start_frontend() {
  if is_port_listening "$FRONTEND_PORT"; then
    log "port $FRONTEND_PORT is already listening; frontend not started again"
    return
  fi

  ensure_robot_assets
  ensure_frontend_env
  mkdir -p "$LOG_DIR"
  local frontend_log="$LOG_DIR/frontend.log"
  log "starting frontend, log: $frontend_log"
  (
    cd "$FRONTEND_DIR"
    exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
  ) >>"$frontend_log" 2>&1 &
  STARTED_PIDS+=("$!")

  wait_for_port "$FRONTEND_PORT" "frontend" 30
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
    if is_port_listening "$port"; then
      printf '%-8s listening on 127.0.0.1:%s\n' "$name" "$port"
    else
      printf '%-8s not listening on 127.0.0.1:%s\n' "$name" "$port"
    fi
  done
}

main() {
  local target="${1:-all}"

  case "$target" in
    all)
      start_daemon
      start_backend
      start_frontend
      connect_backend_to_robot
      ;;
    x11)
      REACHY_SIM_MODE="mujoco-gui"
      start_daemon
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
