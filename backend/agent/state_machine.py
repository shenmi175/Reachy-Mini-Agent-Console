from __future__ import annotations

from events.event_types import AgentState, now_iso


class StateMachine:
    def __init__(self) -> None:
        self.state = AgentState.STOPPED.value

    def snapshot(self) -> dict[str, str]:
        return {"state": self.state}

    def transition_to(self, new_state: AgentState | str, reason: str) -> dict[str, str] | None:
        target = new_state.value if isinstance(new_state, AgentState) else new_state
        if target == self.state:
            return None

        old_state = self.state
        self.state = target
        return {
            "old_state": old_state,
            "new_state": target,
            "reason": reason,
            "timestamp": now_iso(),
        }
