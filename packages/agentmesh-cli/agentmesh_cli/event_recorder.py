from __future__ import annotations

import contextlib
from datetime import UTC, datetime
from typing import Any

from agentmesh_cli.client import AgentmeshdClient


class EventRecorder:
    """Best-effort event recording to agentmeshd.

    On first use, checks daemon connectivity. If unavailable,
    silently skips all subsequent recordings.
    """

    def __init__(self, client: AgentmeshdClient | None = None) -> None:
        self._client = client
        self._available: bool | None = None

    async def try_connect(self) -> bool:
        if self._client is None:
            self._available = False
            return False
        if self._available is not None:
            return self._available
        self._available = await self._client.healthz()
        return self._available

    async def record(
        self,
        *,
        run_id: str,
        kind: str,
        payload: dict[str, Any] | None = None,
        task_id: str | None = None,
        step: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if not await self.try_connect():
            return

        assert self._client is not None
        event: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "run_id": run_id,
            "kind": kind,
            "payload": payload or {},
            "metadata": metadata or {},
        }
        if task_id is not None:
            event["task_id"] = task_id
        if step is not None:
            event["step"] = step

        with contextlib.suppress(Exception):
            await self._client.post_event(event)
