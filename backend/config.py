from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class Settings(BaseModel):
    backend_host: str = "127.0.0.1"
    backend_port: int = 8710
    frontend_host: str = "127.0.0.1"
    frontend_port: int = 5173
    reachy_host: str = "127.0.0.1"
    reachy_port: int = 8001
    reachy_connection_mode: str = "localhost_only"
    reachy_media_backend: str = "no_media"
    persona_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent / "data" / "personas"
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]
    )

    @classmethod
    def load(cls) -> "Settings":
        project_root = Path(__file__).resolve().parent.parent
        config_path = project_root / "configs" / "app.yaml"
        if not config_path.exists():
            return cls()

        with config_path.open("r", encoding="utf-8") as handle:
            raw: dict[str, Any] = yaml.safe_load(handle) or {}

        backend = raw.get("backend", {})
        frontend = raw.get("frontend", {})
        reachy = raw.get("reachy", {})

        return cls(
            backend_host=backend.get("host", "127.0.0.1"),
            backend_port=int(backend.get("port", 8710)),
            frontend_host=frontend.get("host", "127.0.0.1"),
            frontend_port=int(frontend.get("port", 5173)),
            reachy_host=reachy.get("host", "127.0.0.1"),
            reachy_port=int(reachy.get("port", 8001)),
            reachy_connection_mode=reachy.get("connection_mode", "localhost_only"),
            reachy_media_backend=reachy.get("media_backend", "no_media"),
        )
