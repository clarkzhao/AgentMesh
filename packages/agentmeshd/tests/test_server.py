from __future__ import annotations

from pathlib import Path

import pytest
from agentmeshd.events import make_event
from agentmeshd.server import create_app
from agentmeshd.store import EventStore
from starlette.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    store = EventStore(tmp_path)
    app = create_app(store)
    return TestClient(app)


class TestHealthz:
    def test_ok(self, client: TestClient) -> None:
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestPostEvent:
    def test_create_event(self, client: TestClient) -> None:
        body = {
            "schema_version": "1",
            "ts": "2026-01-01T00:00:00Z",
            "run_id": "r1",
            "kind": "status",
            "task_id": "t1",
            "step": None,
            "payload": {"state": "working"},
            "metadata": {},
            "team_run_id": None,
        }
        resp = client.post("/api/events", json=body)
        assert resp.status_code == 201
        data = resp.json()
        assert data["run_id"] == "r1"
        assert data["kind"] == "status"

    def test_invalid_json(self, client: TestClient) -> None:
        resp = client.post(
            "/api/events", content=b"not json", headers={"content-type": "application/json"}
        )
        assert resp.status_code == 400

    def test_non_object_body(self, client: TestClient) -> None:
        resp = client.post("/api/events", json=[1, 2, 3])
        assert resp.status_code == 400


class TestGetEvents:
    def test_empty(self, client: TestClient) -> None:
        resp = client.get("/api/events")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_filter_by_run_id(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        store.append(make_event(run_id="r1", kind="status"))
        store.append(make_event(run_id="r2", kind="status"))
        app = create_app(store)
        c = TestClient(app)

        resp = c.get("/api/events", params={"run_id": "r1"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["run_id"] == "r1"
        store.close()

    def test_limit_param(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        for _ in range(10):
            store.append(make_event(run_id="r1", kind="status"))
        app = create_app(store)
        c = TestClient(app)

        resp = c.get("/api/events", params={"limit": "3"})
        assert resp.status_code == 200
        assert len(resp.json()) == 3
        store.close()

    def test_invalid_limit(self, client: TestClient) -> None:
        resp = client.get("/api/events", params={"limit": "abc"})
        assert resp.status_code == 400


class TestRoundtripViaApi:
    def test_post_then_get(self, client: TestClient) -> None:
        body = {
            "run_id": "r1",
            "kind": "tool",
            "payload": {"name": "exec", "phase": "start"},
        }
        post_resp = client.post("/api/events", json=body)
        assert post_resp.status_code == 201

        get_resp = client.get("/api/events", params={"run_id": "r1"})
        assert get_resp.status_code == 200
        events = get_resp.json()
        assert len(events) == 1
        assert events[0]["kind"] == "tool"
        assert events[0]["payload"]["name"] == "exec"

    def test_auto_fills_ts_and_schema_version(self, client: TestClient) -> None:
        body = {"run_id": "r1", "kind": "status", "payload": {"state": "working"}}
        resp = client.post("/api/events", json=body)
        assert resp.status_code == 201
        data = resp.json()
        assert data["ts"] != ""
        assert data["schema_version"] == "1"
