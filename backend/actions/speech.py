from __future__ import annotations

import asyncio


class MockSpeech:
    async def speak(self, text: str) -> None:
        duration = min(0.9, max(0.25, len(text) / 80))
        await asyncio.sleep(duration)
