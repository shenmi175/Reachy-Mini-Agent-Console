from __future__ import annotations

import asyncio
from collections import deque
from typing import Any

from events.event_types import AgentEvent, WebSocketMessage, as_dict


class EventBus:
    def __init__(self, recent_limit: int = 200) -> None:
        self._recent_events: deque[dict[str, Any]] = deque(maxlen=recent_limit)
        self._recent_messages: deque[dict[str, Any]] = deque(maxlen=recent_limit)
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subscribers.discard(queue)

    def recent_events(self) -> list[dict[str, Any]]:
        return list(self._recent_events)

    def recent_messages(self) -> list[dict[str, Any]]:
        return list(self._recent_messages)

    async def publish(self, message_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        message = as_dict(WebSocketMessage(type=message_type, payload=payload or {}))
        async with self._lock:
            self._recent_messages.append(message)
            subscribers = list(self._subscribers)

        for queue in subscribers:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    queue.task_done()
                except asyncio.QueueEmpty:
                    pass
                queue.put_nowait(message)

        return message

    async def publish_event(self, event: AgentEvent) -> dict[str, Any]:
        payload = as_dict(event)
        self._recent_events.append(payload)
        return await self.publish("event_received", payload)

    async def debug(self, message: str, **extra: Any) -> None:
        await self.publish("debug_log", {"message": message, **extra})

    async def error(self, message: str, **extra: Any) -> None:
        await self.publish("error", {"message": message, **extra})
