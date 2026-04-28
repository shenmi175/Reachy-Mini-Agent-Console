from __future__ import annotations

from events.event_types import DialogueMessage, as_dict


class DialogueMemory:
    def __init__(self, limit: int = 200) -> None:
        self.limit = limit
        self._messages: list[DialogueMessage] = []

    def add(self, role: str, text: str, persona_id: str | None = None) -> DialogueMessage:
        message = DialogueMessage(role=role, text=text, persona_id=persona_id)
        self._messages.append(message)
        if len(self._messages) > self.limit:
            self._messages = self._messages[-self.limit :]
        return message

    def history(self) -> list[dict]:
        return [as_dict(message) for message in self._messages]

    def clear(self) -> None:
        self._messages.clear()
