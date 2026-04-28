# AGENTS.md

## Project Goal

Build an MVP web console for debugging a Reachy Mini embodied social agent.

This is NOT a replacement for the official Reachy Mini Control app. It is an Agent Debug Console focused on:
- agent state machine
- event timeline
- persona switching
- action queue
- dialogue logs
- manual event injection
- Reachy Mini simulation control through the Python SDK

## Environment

- OS: Ubuntu Linux
- Reachy Mini MuJoCo simulation daemon may already be running at:
  - host: 127.0.0.1
  - port: 8001
- Port 8000 is occupied by another model service. Never use, kill, or modify port 8000.
- The backend should use port 8710 by default.
- The frontend should use port 5173 by default.

## Tech Stack

Backend:
- Python 3.12
- FastAPI
- Uvicorn
- WebSocket
- Pydantic
- PyYAML
- SQLite optional for event persistence
- reachy-mini Python SDK if available

Frontend:
- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui style components if practical
- WebSocket client for realtime updates

## Architecture Rules

Create a clean monorepo:

reachy-agent-console/
├── backend/
├── frontend/
├── configs/
├── README.md
└── AGENTS.md

The backend must define:
- RobotBody interface
- MockReachyBody
- ReachyBody for real/simulation SDK connection
- EventBus
- AgentController
- StateMachine
- PersonaManager
- MotionQueue
- MotionLibrary
- WebSocket broadcaster

The frontend must show:
- status panel
- event timeline
- dialogue panel
- action queue
- debug log
- control panel
- persona selector
- manual event injection buttons
- motion buttons

## Important Constraints

- Do not implement real camera, real STT, real TTS, WebRTC, App Store, authentication, system update, Wi-Fi setup, or full 3D visualization in this MVP.
- Use manual event injection first.
- Use mock dialogue replies first.
- If reachy-mini SDK import fails, the app must still run with MockReachyBody.
- Never assume the robot daemon is on port 8000.
- Do not kill existing Python processes.
- Do not modify the official Reachy Mini Control app.
- Keep the code simple, readable, and easy to extend.

## Acceptance Criteria

The MVP is complete when:

1. Backend starts on http://127.0.0.1:8710
2. Frontend starts on http://127.0.0.1:5173
3. UI can connect to backend WebSocket
4. UI can start, stop, reset, and emergency-stop the agent
5. UI can inject events:
   - face_seen
   - face_lost
   - user_speaking
   - user_stopped_speaking
   - idle_timeout
   - hand_wave
   - phone_seen
   - danger_detected
6. Agent state changes are visible in realtime
7. Event timeline updates in realtime
8. Action queue updates in realtime
9. Dialogue log updates in realtime
10. Persona can switch between:
   - friendly
   - quiet
   - playful
11. Motion buttons exist:
   - neutral
   - look_left
   - look_right
   - look_up
   - look_down
   - nod
   - shake_head
   - antenna_wave
12. If Reachy Mini daemon is available at 127.0.0.1:8001, motion commands should affect MuJoCo.
13. If Reachy Mini daemon is unavailable, UI should still work in mock mode.
14. README contains setup, run, and test instructions.

## Development Style

- First inspect the repository.
- Then create an implementation plan.
- Then implement incrementally.
- Prefer simple working code over over-engineered abstractions.
- Add comments only where the behavior is non-obvious.
- After implementation, run available tests/build commands.
- Report what was implemented, how to run it, and any remaining limitations.
