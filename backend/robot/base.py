from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class RobotBody(ABC):
    mode = "unknown"

    @abstractmethod
    async def connect(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def disconnect(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def perform_motion(self, action: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def emergency_stop(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def status(self) -> dict[str, Any]:
        raise NotImplementedError
