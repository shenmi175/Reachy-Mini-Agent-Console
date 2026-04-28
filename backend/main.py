from __future__ import annotations

import asyncio
import json
import socket
from contextlib import asynccontextmanager
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from actions.motion_library import MotionLibrary
from actions.motion_queue import MotionQueue
from agent.controller import AgentController
from agent.memory import DialogueMemory
from agent.persona import PersonaManager
from agent.policy import AgentPolicy
from agent.state_machine import StateMachine
from api import routes_agent, routes_dialogue, routes_persona, routes_robot, websocket
from config import Settings
from events.event_bus import EventBus
from events.event_types import as_dict
from robot.base import RobotBody
from robot.mock_body import MockReachyBody
from robot.reachy_body import ReachyBody, ReachyDaemonBody


class AppContext:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.event_bus = EventBus()
        self.personas = PersonaManager(settings.persona_dir)
        self.memory = DialogueMemory()
        self.state_machine = StateMachine()
        self.motion_library = MotionLibrary()
        self.robot_body: RobotBody = MockReachyBody()
        self.motion_queue = MotionQueue(
            self.motion_library,
            body_provider=lambda: self.robot_body,
            event_bus=self.event_bus,
        )
        self.controller = AgentController(
            state_machine=self.state_machine,
            personas=self.personas,
            memory=self.memory,
            motion_queue=self.motion_queue,
            event_bus=self.event_bus,
            policy=AgentPolicy(),
        )

    async def initialize(self) -> None:
        await self.motion_queue.start()
        await self.connect_robot(auto=True)

    async def shutdown(self) -> None:
        await self.motion_queue.shutdown()
        await self.robot_body.disconnect()

    def agent_status(self) -> dict[str, Any]:
        status = self.controller.status()
        status["robot"] = self.robot_status()
        return status

    def robot_status(self) -> dict[str, Any]:
        return self.robot_body.status()

    async def sim_state(self) -> dict[str, Any]:
        base_url = f"http://{self.settings.reachy_host}:{self.settings.reachy_port}"
        state_url = (
            f"{base_url}/api/state/full"
            "?with_control_mode=true"
            "&with_head_pose=true"
            "&with_target_head_pose=true"
            "&with_head_joints=true"
            "&with_body_yaw=true"
            "&with_target_body_yaw=true"
            "&with_antenna_positions=true"
            "&with_target_antenna_positions=true"
            "&with_passive_joints=true"
            "&use_pose_matrix=true"
        )
        daemon_url = f"{base_url}/api/daemon/status"

        try:
            state, daemon_status = await asyncio.gather(
                asyncio.to_thread(self._fetch_json, state_url),
                asyncio.to_thread(self._fetch_json, daemon_url),
            )
        except Exception as exc:
            return {
                "available": False,
                "target": f"{self.settings.reachy_host}:{self.settings.reachy_port}",
                "error": str(exc),
            }

        return {
            "available": True,
            "target": f"{self.settings.reachy_host}:{self.settings.reachy_port}",
            "state": state,
            "daemon": daemon_status,
        }

    def _fetch_json(self, url: str) -> dict[str, Any]:
        request = Request(url, method="GET", headers={"Accept": "application/json"})
        try:
            opener = build_opener(ProxyHandler({}))
            with opener.open(request, timeout=3) as response:
                text = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Reachy daemon HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Reachy daemon unavailable: {exc}") from exc
        except TimeoutError as exc:
            raise RuntimeError(f"Reachy daemon timed out: {exc}") from exc
        except socket.timeout as exc:
            raise RuntimeError(f"Reachy daemon timed out: {exc}") from exc

        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Reachy daemon returned non-JSON from {url}") from exc
        if not isinstance(parsed, dict):
            return {"value": parsed}
        return parsed

    def snapshot(self) -> dict[str, Any]:
        messages = self.event_bus.recent_messages()
        return {
            "agent": self.agent_status(),
            "robot": self.robot_status(),
            "events": self.event_bus.recent_events(),
            "dialogue": self.memory.history(),
            "actions": self.motion_queue.snapshot()["tasks"],
            "personas": [as_dict(persona) for persona in self.personas.list_personas()],
            "debug": [
                message
                for message in messages
                if message.get("type") in {"debug_log", "error"}
            ],
            "motion_actions": self.motion_library.actions(),
            "reachy_target": f"{self.settings.reachy_host}:{self.settings.reachy_port}",
        }

    async def connect_robot(self, auto: bool = False) -> dict[str, Any]:
        body = ReachyBody(
            host=self.settings.reachy_host,
            port=self.settings.reachy_port,
            connection_mode=self.settings.reachy_connection_mode,
            media_backend=self.settings.reachy_media_backend,
        )
        sdk_error: Exception | None = None
        try:
            await body.connect()
        except Exception as exc:
            sdk_error = exc
            daemon_body = ReachyDaemonBody(
                host=self.settings.reachy_host,
                port=self.settings.reachy_port,
            )
            try:
                await daemon_body.connect()
            except Exception as daemon_exc:
                reason = f"SDK: {sdk_error}; daemon REST: {daemon_exc}"
                self.robot_body = MockReachyBody(reason=reason)
                await self.robot_body.connect()
                await self.event_bus.debug(
                    "Reachy connection unavailable; using MockReachyBody",
                    error=reason,
                    target=f"{self.settings.reachy_host}:{self.settings.reachy_port}",
                )
                if not auto:
                    await self.event_bus.error(
                        "Reachy robot connection failed; mock mode active",
                        error=reason,
                    )
            else:
                self.robot_body = daemon_body
                await self.event_bus.debug(
                    "Reachy daemon REST connected",
                    sdk_error=str(sdk_error),
                    target=f"{self.settings.reachy_host}:{self.settings.reachy_port}",
                )
        else:
            self.robot_body = body
            await self.event_bus.debug(
                "Reachy robot connected",
                target=f"{self.settings.reachy_host}:{self.settings.reachy_port}",
            )

        status = self.robot_status()
        await self.event_bus.publish("robot_status_changed", status)
        return status

    async def disconnect_robot(self) -> dict[str, Any]:
        try:
            await self.robot_body.disconnect()
        except Exception as exc:
            await self.event_bus.error("Robot disconnect failed", error=str(exc))

        self.robot_body = MockReachyBody(
            reason="Robot disconnected by user; mock actions stay local",
            connected=False,
        )
        status = self.robot_status()
        await self.event_bus.publish("robot_status_changed", status)
        await self.event_bus.debug("Robot disconnected by user; mock actions stay local")
        return status

    async def emergency_stop(self) -> dict[str, Any]:
        await self.controller.emergency_stop()
        try:
            await self.robot_body.emergency_stop()
        except Exception as exc:
            await self.event_bus.error("Robot emergency stop failed", error=str(exc))
        status = self.agent_status()
        await self.event_bus.publish("robot_status_changed", self.robot_status())
        return status


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.load()
    context = AppContext(settings)
    app.state.context = context
    await context.initialize()
    try:
        yield
    finally:
        await context.shutdown()


settings = Settings.load()
app = FastAPI(title="Reachy Agent Console", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_agent.router)
app.include_router(routes_robot.router)
app.include_router(routes_persona.router)
app.include_router(routes_dialogue.router)
app.include_router(websocket.router)


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "reachy-agent-console"}
