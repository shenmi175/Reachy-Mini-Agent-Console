from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from events.event_types import DialogueSendRequest

router = APIRouter()


def context(request: Request):
    return request.app.state.context


@router.post("/api/dialogue/send")
async def send_dialogue(payload: DialogueSendRequest, request: Request):
    try:
        return await context(request).controller.send_dialogue(payload.text)
    except Exception as exc:
        await context(request).event_bus.error("Dialogue send failed", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/dialogue/history")
async def dialogue_history(request: Request):
    return {"messages": context(request).memory.history()}
