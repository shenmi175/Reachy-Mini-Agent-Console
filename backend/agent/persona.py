from __future__ import annotations

import random
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class Persona(BaseModel):
    id: str
    name: str
    style: str
    proactive_level: float = 0.5
    greetings: list[str] = Field(default_factory=list)
    motions: dict[str, str] = Field(default_factory=dict)


class PersonaManager:
    def __init__(self, persona_dir: Path) -> None:
        self.persona_dir = persona_dir
        self._personas: dict[str, Persona] = {}
        self._current_id = "friendly"
        self.load()

    def load(self) -> None:
        self._personas.clear()
        for path in sorted(self.persona_dir.glob("*.yaml")):
            with path.open("r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle) or {}
            persona = Persona(**data)
            self._personas[persona.id] = persona

        if not self._personas:
            raise RuntimeError(f"No personas found in {self.persona_dir}")
        if self._current_id not in self._personas:
            self._current_id = sorted(self._personas)[0]

    def list_personas(self) -> list[Persona]:
        return list(self._personas.values())

    def current(self) -> Persona:
        return self._personas[self._current_id]

    def switch(self, persona_id: str) -> Persona:
        if persona_id not in self._personas:
            raise ValueError(f"Unknown persona: {persona_id}")
        self._current_id = persona_id
        return self.current()

    def greeting(self) -> str:
        persona = self.current()
        if not persona.greetings:
            return "你好。"
        return random.choice(persona.greetings)
