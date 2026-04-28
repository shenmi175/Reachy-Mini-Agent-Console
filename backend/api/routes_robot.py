from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from events.event_types import RobotActionRequest, as_dict

router = APIRouter()


def context(request: Request):
    return request.app.state.context


@router.get("/api/robot/status")
async def robot_status(request: Request):
    return context(request).robot_status()


@router.get("/api/robot/sim_state")
async def robot_sim_state(request: Request):
    return await context(request).sim_state()


@router.post("/api/robot/connect")
async def connect_robot(request: Request):
    return await context(request).connect_robot(auto=False)


@router.post("/api/robot/disconnect")
async def disconnect_robot(request: Request):
    return await context(request).disconnect_robot()


@router.post("/api/robot/action")
async def robot_action(payload: RobotActionRequest, request: Request):
    try:
        task = await context(request).motion_queue.enqueue(payload.action, source="api")
        return as_dict(task)
    except Exception as exc:
        await context(request).event_bus.error("Robot action failed", error=str(exc), action=payload.action)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/robot/neutral")
async def robot_neutral(request: Request):
    task = await context(request).motion_queue.enqueue("neutral", source="api")
    return as_dict(task)


@router.post("/api/robot/emergency_stop")
async def robot_emergency_stop(request: Request):
    return await context(request).emergency_stop()
