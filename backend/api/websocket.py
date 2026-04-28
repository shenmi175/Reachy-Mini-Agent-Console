from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    context = websocket.app.state.context
    queue = await context.event_bus.subscribe()

    try:
        await websocket.send_json({"type": "snapshot", "payload": context.snapshot()})
        while True:
            message = await queue.get()
            await websocket.send_json(message)
            queue.task_done()
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        pass
    finally:
        await context.event_bus.unsubscribe(queue)
