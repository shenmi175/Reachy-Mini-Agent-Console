from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from events.event_types import PersonaSwitchRequest, as_dict

router = APIRouter()


def context(request: Request):
    return request.app.state.context


@router.get("/api/personas")
async def personas(request: Request):
    return {"personas": [as_dict(persona) for persona in context(request).personas.list_personas()]}


@router.get("/api/personas/current")
async def current_persona(request: Request):
    return as_dict(context(request).personas.current())


@router.post("/api/personas/switch")
async def switch_persona(payload: PersonaSwitchRequest, request: Request):
    try:
        persona = context(request).personas.switch(payload.persona_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    await context(request).event_bus.debug(
        f"Persona switched to {persona.id}",
        persona_id=persona.id,
        persona_name=persona.name,
    )
    return as_dict(persona)
