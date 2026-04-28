from __future__ import annotations

from agent.persona import Persona


class AgentPolicy:
    def greeting_motion(self, persona: Persona) -> str:
        return persona.motions.get("greeting", "neutral")

    def thinking_motion(self, persona: Persona) -> str:
        return persona.motions.get("thinking", "nod")

    def idle_motion(self, persona: Persona) -> str:
        return persona.motions.get("idle", "neutral")

    def mock_reply(self, text: str, persona: Persona) -> str:
        normalized = text.strip()
        if persona.id == "quiet":
            return f"我听到了。你说的是：{normalized}。我会安静地陪你一起看。"
        if persona.id == "playful":
            return f"收到：{normalized}。社交模块正在努力表现得像个靠谱助手。"
        return f"我听到了：{normalized}。我们可以一步一步来。"
