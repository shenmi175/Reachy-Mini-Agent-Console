from __future__ import annotations

import asyncio
from typing import Any

from actions.motion_queue import MotionQueue
from actions.speech import MockSpeech
from agent.memory import DialogueMemory
from agent.persona import PersonaManager
from agent.policy import AgentPolicy
from agent.state_machine import StateMachine
from events.event_bus import EventBus
from events.event_types import (
    AgentEvent,
    AgentState,
    DialogueMessage,
    InjectEventRequest,
    as_dict,
)


class AgentController:
    def __init__(
        self,
        state_machine: StateMachine,
        personas: PersonaManager,
        memory: DialogueMemory,
        motion_queue: MotionQueue,
        event_bus: EventBus,
        policy: AgentPolicy | None = None,
        speech: MockSpeech | None = None,
    ) -> None:
        self.state_machine = state_machine
        self.personas = personas
        self.memory = memory
        self.motion_queue = motion_queue
        self.event_bus = event_bus
        self.policy = policy or AgentPolicy()
        self.speech = speech or MockSpeech()
        self.last_event: dict[str, Any] | None = None
        self._scheduled: set[asyncio.Task[None]] = set()

    def status(self) -> dict[str, Any]:
        queue = self.motion_queue.snapshot()
        return {
            "running": self.state_machine.state != AgentState.STOPPED.value,
            "state": self.state_machine.state,
            "current_persona": as_dict(self.personas.current()),
            "last_event": self.last_event,
            "current_task": queue["current_task"],
            "queue_length": queue["queue_length"],
            "cooldowns": {},
        }

    async def start(self) -> dict[str, Any]:
        await self._transition(AgentState.IDLE, "Start Agent")
        await self.event_bus.debug("Agent started")
        return self.status()

    async def stop(self) -> dict[str, Any]:
        self._cancel_scheduled()
        await self.motion_queue.clear("Agent stopped")
        await self._transition(AgentState.STOPPED, "Stop Agent")
        await self.event_bus.debug("Agent stopped")
        return self.status()

    async def reset(self) -> dict[str, Any]:
        self._cancel_scheduled()
        await self.motion_queue.clear("Agent reset")
        await self._transition(AgentState.IDLE, "Reset state")
        await self.event_bus.debug("Agent reset to idle")
        return self.status()

    async def emergency_stop(self) -> dict[str, Any]:
        self._cancel_scheduled()
        await self.motion_queue.clear("Emergency stop")
        await self._transition(AgentState.IDLE, "Emergency stop")
        await self.event_bus.debug("Agent emergency stop: state set to idle and queue cleared")
        return self.status()

    async def inject_event(self, request: InjectEventRequest) -> dict[str, Any]:
        event = AgentEvent(
            type=request.type,
            source=request.source,
            priority=request.priority,
            payload=request.payload,
        )
        self.last_event = as_dict(event)
        await self.event_bus.publish_event(event)
        await self.event_bus.debug(
            f"Event received: {event.type}",
            source=event.source,
            priority=event.priority,
        )

        if self.state_machine.state == AgentState.STOPPED.value:
            await self.event_bus.debug(f"Ignored event while stopped: {event.type}")
            return as_dict(event)

        handler = getattr(self, f"_handle_{event.type}", None)
        if handler is not None:
            await handler(event)
        return as_dict(event)

    async def send_dialogue(self, text: str) -> dict[str, Any]:
        clean_text = text.strip()
        if not clean_text:
            raise ValueError("Dialogue text cannot be empty")
        if self.state_machine.state == AgentState.STOPPED.value:
            raise RuntimeError("Agent is stopped; start the agent before sending dialogue")

        user_message = self.memory.add("user", clean_text, self.personas.current().id)
        await self.event_bus.publish("dialogue_message", as_dict(user_message))

        if self.state_machine.state != AgentState.LISTENING.value:
            await self._transition(AgentState.LISTENING, "User dialogue input")
        await self._transition(AgentState.THINKING, "User message received")
        await self.motion_queue.enqueue(
            self.policy.thinking_motion(self.personas.current()),
            source="dialogue",
        )

        await asyncio.sleep(0.15)
        reply_text = self.policy.mock_reply(clean_text, self.personas.current())
        await self._transition(AgentState.SPEAKING, "Mock reply generated")
        assistant_message = self.memory.add("assistant", reply_text, self.personas.current().id)
        await self.event_bus.publish("dialogue_message", as_dict(assistant_message))
        self._schedule(self._finish_speech(assistant_message))
        return as_dict(assistant_message)

    async def _handle_face_seen(self, event: AgentEvent) -> None:
        if self.state_machine.state not in {
            AgentState.IDLE.value,
            AgentState.LISTENING.value,
        }:
            await self.event_bus.debug(
                f"face_seen received while {self.state_machine.state}; keeping current state"
            )
            return

        persona = self.personas.current()
        await self._transition(AgentState.GREETING, "face_seen")
        greeting = self.memory.add("assistant", self.personas.greeting(), persona.id)
        await self.event_bus.publish("dialogue_message", as_dict(greeting))
        await self.motion_queue.enqueue(self.policy.greeting_motion(persona), source="greeting")
        self._schedule(self._complete_greeting())

    async def _handle_face_lost(self, event: AgentEvent) -> None:
        await self._transition(AgentState.IDLE, "face_lost")
        await self.motion_queue.enqueue(self.policy.idle_motion(self.personas.current()), source="event")

    async def _handle_user_speaking(self, event: AgentEvent) -> None:
        await self._transition(AgentState.LISTENING, "user_speaking")

    async def _handle_user_stopped_speaking(self, event: AgentEvent) -> None:
        await self.event_bus.debug("user_stopped_speaking received; waiting for manual text input")

    async def _handle_idle_timeout(self, event: AgentEvent) -> None:
        await self._transition(AgentState.IDLE, "idle_timeout")
        await self.motion_queue.enqueue(self.policy.idle_motion(self.personas.current()), source="event")

    async def _handle_hand_wave(self, event: AgentEvent) -> None:
        await self.motion_queue.enqueue("antenna_wave", source="event")

    async def _handle_phone_seen(self, event: AgentEvent) -> None:
        await self.motion_queue.enqueue("look_down", source="event")

    async def _handle_danger_detected(self, event: AgentEvent) -> None:
        await self.event_bus.debug(
            "danger_detected received; use Emergency Stop if robot must halt",
            severity="warning",
        )
        await self.motion_queue.enqueue("neutral", source="event")

    async def _complete_greeting(self) -> None:
        await asyncio.sleep(1.2)
        if self.state_machine.state != AgentState.GREETING.value:
            return
        event = AgentEvent(type="greeting_done", source="agent", priority=2)
        self.last_event = as_dict(event)
        await self.event_bus.publish_event(event)
        await self._transition(AgentState.LISTENING, "greeting_done")

    async def _finish_speech(self, message: DialogueMessage) -> None:
        await self.speech.speak(message.text)
        if self.state_machine.state != AgentState.SPEAKING.value:
            return
        event = AgentEvent(type="speech_done", source="agent", priority=2)
        self.last_event = as_dict(event)
        await self.event_bus.publish_event(event)
        await self._transition(AgentState.IDLE, "speech_done")

    async def _transition(self, new_state: AgentState, reason: str) -> None:
        transition = self.state_machine.transition_to(new_state, reason)
        if transition is None:
            return
        await self.event_bus.publish("agent_state_changed", transition)
        await self.event_bus.debug(
            f"State {transition['old_state']} -> {transition['new_state']}: {reason}",
            reason=reason,
        )

    def _schedule(self, coro: Any) -> None:
        task = asyncio.create_task(coro)
        self._scheduled.add(task)
        task.add_done_callback(self._scheduled.discard)

    def _cancel_scheduled(self) -> None:
        for task in list(self._scheduled):
            task.cancel()
        self._scheduled.clear()
