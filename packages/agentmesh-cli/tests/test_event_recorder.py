from __future__ import annotations

import json

import pytest
import respx
from agentmesh_cli.client import AgentmeshdClient
from agentmesh_cli.event_recorder import EventRecorder
from httpx import Response


class TestEventRecorder:
    @pytest.mark.asyncio
    async def test_record_when_daemon_available(self) -> None:
        with respx.mock(base_url="http://127.0.0.1:8321") as mock_api:
            mock_api.get("/healthz").mock(return_value=Response(200, json={"status": "ok"}))
            post_route = mock_api.post("/api/events").mock(return_value=Response(201, json={}))

            client = AgentmeshdClient()
            recorder = EventRecorder(client)
            try:
                await recorder.record(run_id="r1", kind="status", payload={"state": "working"})
                assert post_route.called
            finally:
                await client.close()

    @pytest.mark.asyncio
    async def test_record_skips_when_no_client(self) -> None:
        recorder = EventRecorder(None)
        # Should not raise
        await recorder.record(run_id="r1", kind="status")
        assert await recorder.try_connect() is False

    @pytest.mark.asyncio
    async def test_record_skips_after_failed_healthz(self) -> None:
        with respx.mock(base_url="http://127.0.0.1:8321", assert_all_called=False) as mock_api:
            mock_api.get("/healthz").mock(return_value=Response(503))
            post_route = mock_api.post("/api/events").mock(return_value=Response(201, json={}))

            client = AgentmeshdClient()
            recorder = EventRecorder(client)
            try:
                await recorder.record(run_id="r1", kind="status")
                # Should not try to post
                assert not post_route.called
            finally:
                await client.close()

    @pytest.mark.asyncio
    async def test_try_connect_caches_result(self) -> None:
        with respx.mock(base_url="http://127.0.0.1:8321") as mock_api:
            healthz_route = mock_api.get("/healthz").mock(
                return_value=Response(200, json={"status": "ok"})
            )

            client = AgentmeshdClient()
            recorder = EventRecorder(client)
            try:
                assert await recorder.try_connect() is True
                assert await recorder.try_connect() is True
                # healthz should be called only once
                assert healthz_route.call_count == 1
            finally:
                await client.close()

    @pytest.mark.asyncio
    async def test_record_swallows_post_errors(self) -> None:
        with respx.mock(base_url="http://127.0.0.1:8321") as mock_api:
            mock_api.get("/healthz").mock(return_value=Response(200, json={"status": "ok"}))
            mock_api.post("/api/events").mock(return_value=Response(500))

            client = AgentmeshdClient()
            recorder = EventRecorder(client)
            try:
                # Should not raise despite 500
                await recorder.record(run_id="r1", kind="error")
            finally:
                await client.close()

    @pytest.mark.asyncio
    async def test_record_includes_optional_fields(self) -> None:
        with respx.mock(base_url="http://127.0.0.1:8321") as mock_api:
            mock_api.get("/healthz").mock(return_value=Response(200, json={"status": "ok"}))
            post_route = mock_api.post("/api/events").mock(return_value=Response(201, json={}))

            client = AgentmeshdClient()
            recorder = EventRecorder(client)
            try:
                await recorder.record(
                    run_id="r1",
                    kind="tool",
                    task_id="t1",
                    step="analyze",
                    payload={"name": "exec"},
                    metadata={"agent_name": "Test"},
                )
                body = post_route.calls.last.request.content
                data = json.loads(body)
                assert data["task_id"] == "t1"
                assert data["step"] == "analyze"
                assert data["payload"]["name"] == "exec"
                assert data["metadata"]["agent_name"] == "Test"
            finally:
                await client.close()
