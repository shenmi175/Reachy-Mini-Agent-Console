from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def as_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


class AgentState(str, Enum):
    STOPPED = "stopped"
    IDLE = "idle"
    GREETING = "greeting"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    ACTING = "acting"
    ERROR = "error"


class MotionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


ManualEventType = Literal[
    "face_seen",
    "face_lost",
    "user_speaking",
    "user_stopped_speaking",
    "idle_timeout",
    "hand_wave",
    "phone_seen",
    "danger_detected",
]


class AgentEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str
    source: str = "manual"
    priority: int = 3
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=now_iso)


class WebSocketMessage(BaseModel):
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=now_iso)


class InjectEventRequest(BaseModel):
    type: ManualEventType
    source: str = "manual"
    priority: int = 3
    payload: dict[str, Any] = Field(default_factory=dict)


class RobotActionRequest(BaseModel):
    action: str


class PersonaSwitchRequest(BaseModel):
    persona_id: str


class DialogueSendRequest(BaseModel):
    text: str


class DialogueMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    role: Literal["user", "assistant", "system"]
    text: str
    persona_id: str | None = None
    timestamp: str = Field(default_factory=now_iso)


class MotionTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    action: str
    status: MotionStatus = MotionStatus.PENDING
    source: str = "api"
    created_at: str = Field(default_factory=now_iso)
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
