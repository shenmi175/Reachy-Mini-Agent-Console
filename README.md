# Reachy Agent Console

MVP web console for debugging a Reachy Mini embodied social agent. This project is not a replacement for the official Reachy Mini Control app; it focuses on agent state, event flow, persona switching, motion queue visibility, dialogue logs, manual event injection, and optional Reachy Mini simulation control.

## Ports

- Backend: `http://127.0.0.1:8710`
- Frontend: `http://127.0.0.1:5173`
- Reachy Mini daemon target: `127.0.0.1:8001`
- Do not use port `8000`; it is reserved for another service.

## Ubuntu Prerequisites

Install Python venv support once before using the auto-start script:

```bash
sudo apt install python3.12-venv
```

Without this package, Ubuntu's Python cannot bootstrap `pip` inside virtual environments, so dependency auto-install cannot start.

The optional Reachy Mini MuJoCo daemon also builds native Python packages on Linux. Install these once if you want `./start.sh` to auto-install and launch the daemon:

```bash
sudo apt install pkg-config libcairo2-dev libgirepository1.0-dev gobject-introspection gir1.2-gtk-3.0 python3.12-dev build-essential
```

To run only the debug console in mock robot mode, skip the optional daemon:

```bash
START_REACHY_DAEMON=0 ./start.sh
```

## Repository Layout

```text
reachy-agent-console/
├── backend/
├── frontend/
├── configs/
├── README.md
└── AGENTS.md
```

## Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8710 --reload
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`.

The main console includes a Live 3D Simulation panel. It loads the official
Reachy Mini URDF/STL assets in a Three.js viewer and subscribes directly to the
daemon state stream:

```text
ws://127.0.0.1:8001/api/state/ws/full
```

The viewer applies `head_joints`, `body_yaw`, `antennas_position`, and
`passive_joints` to the URDF joints in realtime. If the daemon omits
`passive_joints`, the frontend computes them with the same lightweight WASM
kinematics module used by the official desktop viewer. The native MuJoCo GLFW
window is still a desktop viewer, not a browser-embeddable surface; this console
shows the same robot state in-browser and keeps the daemon dashboard available
as a fallback tab.

## Reachy Mini Simulation

If you want motion commands to affect the MuJoCo simulation, start the daemon separately:

```bash
cd ~/code/reachy-agent-lab
source .venv/bin/activate
reachy-mini-daemon --sim --headless --no-media --fastapi-host 127.0.0.1 --fastapi-port 8001
```

The console first tries the Python SDK with `connection_mode=localhost_only` and `media_backend=no_media`. If the SDK is unavailable but the daemon REST API is reachable at `127.0.0.1:8001`, it uses the daemon `/api/move/goto` endpoint for basic motions. If both paths fail, the backend automatically falls back to `MockReachyBody`; the UI remains usable and shows mock mode/debug logs.

## One-Command Startup

From the repository root:

```bash
./start.sh
```

The script starts, if needed:

- Reachy daemon on `127.0.0.1:8001`
- Backend on `127.0.0.1:8710`
- Frontend on `127.0.0.1:5173`

It does not kill existing processes. If a port is already listening, it skips that service and reuses it.

On first run, the script creates local dependency environments when needed:

- `backend/.venv` for the FastAPI backend
- `frontend/node_modules` for the Vite frontend
- `.venv-reachy-daemon` for the optional Reachy daemon, installing `reachy-mini[mujoco]`

If `~/code/reachy-agent-lab/.venv/bin/reachy-mini-daemon` already exists, the script uses that existing daemon environment. If `~/code/reachy-agent-lab` is a local Reachy source checkout without a virtualenv, the script installs that checkout into `.venv-reachy-daemon` instead of using PyPI. Set `AUTO_INSTALL_DEPS=0` to disable all automatic installs.

The default daemon mode is headless MuJoCo:

```bash
REACHY_SIM_MODE=mujoco-headless ./start.sh
```

If MuJoCo/GTK still fails on your desktop session, use lightweight mockup simulation:

```bash
REACHY_SIM_MODE=mockup ./start.sh
```

To force a visible X11 MuJoCo viewer from the automation script:

```bash
./start.sh x11
```

This starts the daemon as:

```bash
GLFW_PLATFORM=x11 GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb MUJOCO_GL=glfw \
  reachy-mini-daemon --sim --no-media --fastapi-host 127.0.0.1 --fastapi-port 8001
```

To start only the daemon in X11 mode:

```bash
./start.sh daemon-x11
```

The `x11` and `daemon-x11` targets intentionally open the native MuJoCo viewer.
To run the console without that desktop 3D window, stop the X11 run with
`Ctrl-C` in the terminal that launched it and start the default headless mode:

```bash
./start.sh
```

Or start only the backend and browser frontend, reusing an already running
daemon if one exists:

```bash
./start.sh app
```

If EGL is unavailable in headless mode, try:

```bash
MUJOCO_GL=osmesa ./start.sh daemon
```

## Troubleshooting

Check the current service state:

```bash
./start.sh status
```

If the browser shows `404 Not Found` at `http://127.0.0.1:5173`, the port is
usually occupied by a stale or unrelated Node/Vite process. `./start.sh status`
will show this as:

```text
frontend listening but unhealthy on 127.0.0.1:5173
```

Stop the process that is occupying port `5173`, then rerun `./start.sh app` or
`./start.sh`.

## API Surface

Agent:

- `POST /api/agent/start`
- `POST /api/agent/stop`
- `POST /api/agent/reset`
- `POST /api/agent/emergency_stop`
- `GET /api/agent/status`

Events:

- `POST /api/events/inject`
- `GET /api/events/recent`

Robot:

- `GET /api/robot/status`
- `POST /api/robot/connect`
- `POST /api/robot/disconnect`
- `POST /api/robot/action`
- `POST /api/robot/neutral`
- `POST /api/robot/emergency_stop`

Personas:

- `GET /api/personas`
- `GET /api/personas/current`
- `POST /api/personas/switch`

Dialogue:

- `POST /api/dialogue/send`
- `GET /api/dialogue/history`

Realtime:

- `GET /ws`

## Manual Events

- `face_seen`
- `face_lost`
- `user_speaking`
- `user_stopped_speaking`
- `idle_timeout`
- `hand_wave`
- `phone_seen`
- `danger_detected`

## Motion Actions

- `neutral`
- `look_left`
- `look_right`
- `look_up`
- `look_down`
- `nod`
- `shake_head`
- `antenna_wave`

## Personas

- `friendly`: 小跃
- `quiet`: 静静
- `playful`: 小跳

## Basic Checks

Backend import check:

```bash
cd backend
python -c "import main; print(main.app.title)"
```

Frontend build check:

```bash
cd frontend
npm install
npm run build
```

Live 3D browser check, while the app is running on `127.0.0.1:5173`:

```bash
cd frontend
npm run check:live3d
```

## MVP Limitations

- No real camera, STT, TTS, WebRTC, authentication, app store flow, Wi-Fi setup, or system update flow.
- Dialogue is mock-only and does not call a real LLM.
- Reachy SDK integration is isolated behind `ReachyBody`; unsupported SDK API changes are reported to the Debug Log and do not crash the service.
- The 3D viewer is a debug visualization driven by daemon kinematic state; it does not embed the native MuJoCo renderer or camera feeds.
# Reachy-Mini-Agent-Console
