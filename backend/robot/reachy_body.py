from __future__ import annotations

import asyncio
import inspect
import json
import math
import socket
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

from robot.base import RobotBody


class ReachyBody(RobotBody):
    mode = "reachy"

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 8001,
        connection_mode: str = "localhost_only",
        media_backend: str = "no_media",
    ) -> None:
        self.host = host
        self.port = port
        self.connection_mode = connection_mode
        self.media_backend = media_backend
        self.client: Any | None = None
        self._context: Any | None = None
        self._create_head_pose: Any | None = None
        self._np: Any | None = None
        self.connected = False
        self.last_action: str | None = None

    async def connect(self) -> None:
        await asyncio.to_thread(self._connect_sync)

    async def disconnect(self) -> None:
        await asyncio.to_thread(self._disconnect_sync)

    async def perform_motion(self, action: str) -> None:
        await asyncio.to_thread(self._perform_motion_sync, action)

    async def emergency_stop(self) -> None:
        await asyncio.to_thread(self._emergency_stop_sync)

    def status(self) -> dict[str, Any]:
        self.connected = self._is_reachable()
        return {
            "mode": self.mode,
            "connected": self.connected,
            "target": f"{self.host}:{self.port}",
            "connection_mode": self.connection_mode,
            "media_backend": self.media_backend,
            "last_action": self.last_action,
        }

    def _connect_sync(self) -> None:
        try:
            from reachy_mini import ReachyMini
            from reachy_mini.utils import create_head_pose
            import numpy as np
        except Exception as exc:
            raise RuntimeError(f"reachy-mini SDK import failed: {exc}") from exc

        self._create_head_pose = create_head_pose
        self._np = np

        kwargs = {
            "host": self.host,
            "port": self.port,
            "connection_mode": self.connection_mode,
            "media_backend": self.media_backend,
        }
        self._context = self._construct_client(ReachyMini, kwargs)
        self.client = self._context

        if hasattr(self._context, "__enter__"):
            entered = self._context.__enter__()
            if entered is not None:
                self.client = entered

        self.connected = True

    def _construct_client(self, cls: Any, desired_kwargs: dict[str, Any]) -> Any:
        attempts = [
            desired_kwargs,
            {
                "connection_mode": self.connection_mode,
                "media_backend": self.media_backend,
                "host": self.host,
                "port": self.port,
            },
            {
                "connection_mode": self.connection_mode,
                "media_backend": self.media_backend,
            },
            {},
        ]

        last_error: Exception | None = None
        for kwargs in attempts:
            try:
                signature = inspect.signature(cls)
                supported = {
                    key: value
                    for key, value in kwargs.items()
                    if key in signature.parameters
                }
            except (TypeError, ValueError):
                supported = kwargs

            try:
                return cls(**supported)
            except Exception as exc:
                last_error = exc

        raise RuntimeError(f"ReachyMini client construction failed: {last_error}")

    def _disconnect_sync(self) -> None:
        if self._context is not None and hasattr(self._context, "__exit__"):
            self._context.__exit__(None, None, None)
        elif self.client is not None and hasattr(self.client, "disconnect"):
            self.client.disconnect()
        self.connected = False

    def _perform_motion_sync(self, action: str) -> None:
        if not self.connected or self.client is None:
            raise RuntimeError("ReachyBody is not connected")

        if action == "neutral":
            self._goto(head=self._head_pose(), antennas=[0, 0], body_yaw=0, duration=0.35)
        elif action == "look_left":
            self._goto(body_yaw=25, duration=0.35)
        elif action == "look_right":
            self._goto(body_yaw=-25, duration=0.35)
        elif action == "look_up":
            self._goto(head=self._head_pose(z=12), duration=0.35)
        elif action == "look_down":
            self._goto(head=self._head_pose(z=-8), duration=0.35)
        elif action == "nod":
            for z in (12, -8, 8, 0):
                self._goto(head=self._head_pose(z=z), duration=0.22)
        elif action == "shake_head":
            for body_yaw in (22, -22, 14, 0):
                self._goto(body_yaw=body_yaw, duration=0.22)
        elif action == "antenna_wave":
            for antennas in ([35, -35], [-35, 35], [25, -25], [0, 0]):
                self._goto(antennas=antennas, duration=0.2)
        else:
            raise ValueError(f"Unsupported Reachy motion: {action}")

        self.last_action = action

    def _emergency_stop_sync(self) -> None:
        self.last_action = "emergency_stop"
        if self.client is None:
            return
        for name in ("emergency_stop", "stop", "cancel_all_goto"):
            method = getattr(self.client, name, None)
            if callable(method):
                method()
                return
        self._goto(head=self._head_pose(), antennas=[0, 0], body_yaw=0, duration=0.1)

    def _head_pose(self, z: float = 0, roll: float = 0) -> Any:
        if self._create_head_pose is None:
            raise RuntimeError("Reachy head pose helper is unavailable")
        return self._create_head_pose(z=z, roll=roll, degrees=True, mm=True)

    def _goto(
        self,
        head: Any | None = None,
        antennas: list[float] | None = None,
        body_yaw: float | None = None,
        duration: float = 0.35,
    ) -> None:
        if self.client is None:
            raise RuntimeError("Reachy client is unavailable")

        if not hasattr(self.client, "goto_target"):
            raise RuntimeError("Reachy client does not expose goto_target")

        kwargs: dict[str, Any] = {"duration": duration}
        if head is not None:
            kwargs["head"] = head
        if antennas is not None:
            if self._np is not None:
                kwargs["antennas"] = self._np.deg2rad(antennas)
            else:
                kwargs["antennas"] = antennas
        if body_yaw is not None:
            kwargs["body_yaw"] = self._np.deg2rad(body_yaw) if self._np is not None else body_yaw

        try:
            self.client.goto_target(**kwargs, method="minjerk")
        except TypeError:
            self.client.goto_target(**kwargs)
        time.sleep(duration + 0.03)


class ReachyDaemonBody(RobotBody):
    mode = "reachy"

    def __init__(self, host: str = "127.0.0.1", port: int = 8001) -> None:
        self.host = host
        self.port = port
        self.connected = False
        self.last_action: str | None = None

    async def connect(self) -> None:
        await asyncio.to_thread(self._connect_sync)

    async def disconnect(self) -> None:
        self.connected = False

    async def perform_motion(self, action: str) -> None:
        await asyncio.to_thread(self._perform_motion_sync, action)

    async def emergency_stop(self) -> None:
        await asyncio.to_thread(self._neutral_sync)
        self.last_action = "emergency_stop"

    def status(self) -> dict[str, Any]:
        self.connected = self._is_reachable()
        return {
            "mode": self.mode,
            "connected": self.connected,
            "target": f"{self.host}:{self.port}",
            "transport": "daemon_rest",
            "last_action": self.last_action,
        }

    def _connect_sync(self) -> None:
        self._request("GET", "/api/daemon/status")
        self.connected = True

    def _perform_motion_sync(self, action: str) -> None:
        if not self.connected:
            raise RuntimeError("Reachy daemon body is not connected")

        if action == "neutral":
            self._goto(head_z=0, antennas=[0, 0], body_yaw=0, duration=0.35)
        elif action == "look_left":
            self._goto(body_yaw=25, duration=0.35)
        elif action == "look_right":
            self._goto(body_yaw=-25, duration=0.35)
        elif action == "look_up":
            self._goto(head_z=12, duration=0.35)
        elif action == "look_down":
            self._goto(head_z=-8, duration=0.35)
        elif action == "nod":
            for z in (12, -8, 8, 0):
                self._goto(head_z=z, duration=0.22)
        elif action == "shake_head":
            for body_yaw in (22, -22, 14, 0):
                self._goto(body_yaw=body_yaw, duration=0.22)
        elif action == "antenna_wave":
            for antennas in ([35, -35], [-35, 35], [25, -25], [0, 0]):
                self._goto(antennas=antennas, duration=0.2)
        else:
            raise ValueError(f"Unsupported Reachy daemon motion: {action}")

        self.last_action = action

    def _neutral_sync(self) -> None:
        if self.connected:
            self._goto(head_z=0, antennas=[0, 0], body_yaw=0, duration=0.1)

    def _goto(
        self,
        head_z: float | None = None,
        antennas: list[float] | None = None,
        body_yaw: float | None = None,
        duration: float = 0.35,
    ) -> None:
        body: dict[str, Any] = {
            "duration": duration,
            "interpolation": "minjerk",
        }
        if head_z is not None:
            body["head_pose"] = {
                "x": 0.0,
                "y": 0.0,
                "z": head_z / 1000,
                "roll": 0.0,
                "pitch": 0.0,
                "yaw": 0.0,
            }
        if antennas is not None:
            body["antennas"] = [math.radians(value) for value in antennas]
        if body_yaw is not None:
            body["body_yaw"] = math.radians(body_yaw)

        self._request("POST", "/api/move/goto", body)
        time.sleep(duration + 0.03)

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        url = f"http://{self.host}:{self.port}{path}"
        encoded = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(
            url,
            data=encoded,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            opener = build_opener(ProxyHandler({}))
            with opener.open(request, timeout=5) as response:
                text = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Reachy daemon HTTP {exc.code} for {path}: {detail}") from exc
        except URLError as exc:
            self.connected = False
            raise RuntimeError(f"Reachy daemon request failed for {path}: {exc}") from exc
        except TimeoutError as exc:
            self.connected = False
            raise RuntimeError(f"Reachy daemon request timed out for {path}: {exc}") from exc
        except socket.timeout as exc:
            self.connected = False
            raise RuntimeError(f"Reachy daemon request timed out for {path}: {exc}") from exc

        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}

    def _is_reachable(self) -> bool:
        try:
            with socket.create_connection((self.host, self.port), timeout=0.2):
                return True
        except OSError:
            return False
