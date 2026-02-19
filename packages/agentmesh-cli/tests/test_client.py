from __future__ import annotations

import pytest
import respx
from agentmesh_cli.client import AgentmeshdClient
from httpx import Response


@pytest.fixture
def mock_api() -> respx.MockRouter:
    with respx.mock(base_url="http://127.0.0.1:8321") as router:
        yield router


class TestAgentmeshdClient:
    @pytest.mark.asyncio
    async def test_healthz_ok(self, mock_api: respx.MockRouter) -> None:
        mock_api.get("/healthz").mock(return_value=Response(200, json={"status": "ok"}))

        client = AgentmeshdClient()
        try:
            assert await client.healthz() is True
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_healthz_unreachable(self) -> None:
        client = AgentmeshdClient(base_url="http://127.0.0.1:1")
        try:
            assert await client.healthz() is False
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_post_event(self, mock_api: respx.MockRouter) -> None:
        event_data = {
            "run_id": "r1",
            "kind": "status",
            "payload": {"state": "working"},
        }
        mock_api.post("/api/events").mock(
            return_value=Response(201, json={**event_data, "ts": "t"})
        )

        client = AgentmeshdClient()
        try:
            result = await client.post_event(event_data)
            assert result["run_id"] == "r1"
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_get_events(self, mock_api: respx.MockRouter) -> None:
        events = [{"run_id": "r1", "kind": "status", "ts": "t"}]
        mock_api.get("/api/events").mock(return_value=Response(200, json=events))

        client = AgentmeshdClient()
        try:
            result = await client.get_events(run_id="r1")
            assert len(result) == 1
            assert result[0]["run_id"] == "r1"
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_get_events_with_filters(self, mock_api: respx.MockRouter) -> None:
        route = mock_api.get("/api/events").mock(return_value=Response(200, json=[]))

        client = AgentmeshdClient()
        try:
            await client.get_events(run_id="r1", task_id="t1", kind="status", limit=50)
            assert route.called
            request = route.calls.last.request
            assert "run_id=r1" in str(request.url)
            assert "task_id=t1" in str(request.url)
            assert "kind=status" in str(request.url)
            assert "limit=50" in str(request.url)
        finally:
            await client.close()
