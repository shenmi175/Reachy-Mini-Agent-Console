from __future__ import annotations

import asyncio
from typing import Any

from robot.base import RobotBody


class MockReachyBody(RobotBody):
    mode = "mock"

    def __init__(self, reason: str | None = None, connected: bool = True) -> None:
        self.connected = connected
        self.reason = reason or "Reachy Mini SDK or daemon is unavailable"
        self.last_action: str | None = None

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    async def perform_motion(self, action: str) -> None:
        self.last_action = action
        await asyncio.sleep(0.25)

    async def emergency_stop(self) -> None:
        self.last_action = "emergency_stop"
        await asyncio.sleep(0.05)

    def status(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "connected": self.connected,
            "target": "mock",
            "last_action": self.last_action,
            "message": self.reason,
        }
