from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from events.event_types import InjectEventRequest

router = APIRouter()


def context(request: Request):
    return request.app.state.context


@router.post("/api/agent/start")
async def start_agent(request: Request):
    return await context(request).controller.start()


@router.post("/api/agent/stop")
async def stop_agent(request: Request):
    return await context(request).controller.stop()


@router.post("/api/agent/reset")
async def reset_agent(request: Request):
    return await context(request).controller.reset()


@router.post("/api/agent/emergency_stop")
async def emergency_stop_agent(request: Request):
    return await context(request).emergency_stop()


@router.get("/api/agent/status")
async def agent_status(request: Request):
    return context(request).agent_status()


@router.post("/api/events/inject")
async def inject_event(payload: InjectEventRequest, request: Request):
    try:
        return await context(request).controller.inject_event(payload)
    except Exception as exc:
        await context(request).event_bus.error("Event injection failed", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/events/recent")
async def recent_events(request: Request):
    return {"events": context(request).event_bus.recent_events()}
