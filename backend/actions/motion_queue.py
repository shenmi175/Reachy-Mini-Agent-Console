from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Callable
from typing import Any

from actions.motion_library import MotionLibrary
from events.event_bus import EventBus
from events.event_types import MotionStatus, MotionTask, as_dict, now_iso
from robot.base import RobotBody


class MotionQueue:
    def __init__(
        self,
        motion_library: MotionLibrary,
        body_provider: Callable[[], RobotBody],
        event_bus: EventBus,
    ) -> None:
        self.motion_library = motion_library
        self.body_provider = body_provider
        self.event_bus = event_bus
        self._queue: asyncio.Queue[MotionTask] = asyncio.Queue()
        self._tasks: OrderedDict[str, MotionTask] = OrderedDict()
        self._lock = asyncio.Lock()
        self._worker: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._run(), name="motion-queue-worker")

    async def shutdown(self) -> None:
        if self._worker and not self._worker.done():
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass

    async def enqueue(self, action: str, source: str = "api") -> MotionTask:
        self.motion_library.validate(action)
        await self.start()

        task = MotionTask(action=action, source=source)
        async with self._lock:
            self._tasks[task.id] = task
            while len(self._tasks) > 100:
                self._tasks.popitem(last=False)

        await self._queue.put(task)
        await self.event_bus.publish("action_queued", as_dict(task))
        return task

    async def clear(self, reason: str = "queue cleared") -> None:
        cancelled: list[MotionTask] = []
        async with self._lock:
            for task in self._tasks.values():
                if task.status in {MotionStatus.PENDING, MotionStatus.RUNNING}:
                    task.status = MotionStatus.CANCELLED
                    task.finished_at = now_iso()
                    task.error = reason
                    cancelled.append(task)

            while not self._queue.empty():
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                except asyncio.QueueEmpty:
                    break

        for task in cancelled:
            await self.event_bus.publish("action_finished", as_dict(task))
        if cancelled:
            await self.event_bus.debug(f"Motion queue cleared: {reason}")

    def snapshot(self) -> dict[str, Any]:
        tasks = [as_dict(task) for task in self._tasks.values()]
        active = [
            task
            for task in tasks
            if task["status"] in {MotionStatus.PENDING.value, MotionStatus.RUNNING.value}
        ]
        running = next((task for task in tasks if task["status"] == MotionStatus.RUNNING.value), None)
        return {
            "tasks": tasks,
            "queue_length": len(active),
            "current_task": running,
        }

    async def _run(self) -> None:
        while True:
            task = await self._queue.get()
            try:
                if task.status == MotionStatus.CANCELLED:
                    continue

                task.status = MotionStatus.RUNNING
                task.started_at = now_iso()
                await self.event_bus.publish("action_started", as_dict(task))

                try:
                    await self.motion_library.execute(task.action, self.body_provider())
                except Exception as exc:
                    task.status = MotionStatus.FAILED
                    task.error = str(exc)
                    await self.event_bus.error(
                        f"Motion failed: {task.action}",
                        action=task.action,
                        error=str(exc),
                    )
                else:
                    if task.status != MotionStatus.CANCELLED:
                        task.status = MotionStatus.DONE
                finally:
                    task.finished_at = now_iso()
                    await self.event_bus.publish("action_finished", as_dict(task))
            finally:
                self._queue.task_done()
