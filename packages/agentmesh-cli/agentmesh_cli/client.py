from __future__ import annotations

import os
from typing import Any

import httpx

DEFAULT_DAEMON_URL = "http://127.0.0.1:8321"


def _resolve_daemon_url(override: str | None = None) -> str:
    if override:
        return override
    return os.environ.get("AGENTMESH_DAEMON_URL", DEFAULT_DAEMON_URL)


class AgentmeshdClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = _resolve_daemon_url(base_url)
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=10.0)

    async def healthz(self) -> bool:
        try:
            resp = await self._client.get("/healthz")
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def post_event(self, event: dict[str, Any]) -> dict[str, Any]:
        resp = await self._client.post("/api/events", json=event)
        resp.raise_for_status()
        result: dict[str, Any] = resp.json()
        return result

    async def get_events(
        self,
        *,
        run_id: str | None = None,
        task_id: str | None = None,
        kind: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, str | int] = {"limit": limit}
        if run_id is not None:
            params["run_id"] = run_id
        if task_id is not None:
            params["task_id"] = task_id
        if kind is not None:
            params["kind"] = kind
        resp = await self._client.get("/api/events", params=params)
        resp.raise_for_status()
        result: list[dict[str, Any]] = resp.json()
        return result

    async def close(self) -> None:
        await self._client.aclose()
