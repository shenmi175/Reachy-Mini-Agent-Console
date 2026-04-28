from __future__ import annotations

from robot.base import RobotBody


class MotionLibrary:
    SUPPORTED_ACTIONS = [
        "neutral",
        "look_left",
        "look_right",
        "look_up",
        "look_down",
        "nod",
        "shake_head",
        "antenna_wave",
    ]

    def actions(self) -> list[str]:
        return list(self.SUPPORTED_ACTIONS)

    def validate(self, action: str) -> None:
        if action not in self.SUPPORTED_ACTIONS:
            raise ValueError(f"Unsupported motion action: {action}")

    async def execute(self, action: str, body: RobotBody) -> None:
        self.validate(action)
        await body.perform_motion(action)
