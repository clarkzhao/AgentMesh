from __future__ import annotations

import json
from pathlib import Path

from agentmeshd.events import EventV1, make_event
from agentmeshd.store import EventStore


class TestEventStoreAppendAndQuery:
    def test_append_then_query(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        event = make_event(run_id="r1", kind="status", payload={"state": "working"}, task_id="t1")
        store.append(event)

        results = store.query(run_id="r1")
        assert len(results) == 1
        assert results[0].run_id == "r1"
        assert results[0].kind == "status"
        assert results[0].payload == {"state": "working"}
        store.close()

    def test_multiple_events_ordered(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        for i in range(5):
            store.append(make_event(run_id="r1", kind="status", payload={"i": i}))

        results = store.query(run_id="r1")
        assert len(results) == 5
        assert [r.payload["i"] for r in results] == [0, 1, 2, 3, 4]
        store.close()

    def test_filter_by_task_id(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        store.append(make_event(run_id="r1", kind="status", task_id="t1"))
        store.append(make_event(run_id="r1", kind="status", task_id="t2"))

        results = store.query(task_id="t1")
        assert len(results) == 1
        assert results[0].task_id == "t1"
        store.close()

    def test_filter_by_kind(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        store.append(make_event(run_id="r1", kind="status"))
        store.append(make_event(run_id="r1", kind="tool"))
        store.append(make_event(run_id="r1", kind="error"))

        results = store.query(kind="tool")
        assert len(results) == 1
        assert results[0].kind == "tool"
        store.close()

    def test_limit(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        for i in range(10):
            store.append(make_event(run_id="r1", kind="status", payload={"i": i}))

        results = store.query(limit=3)
        assert len(results) == 3
        store.close()

    def test_empty_query(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        results = store.query()
        assert results == []
        store.close()


class TestJsonlConsistency:
    def test_jsonl_matches_sqlite(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        events = [
            make_event(run_id="r1", kind="status", payload={"state": "working"}, task_id="t1"),
            make_event(run_id="r1", kind="tool", payload={"name": "exec"}, task_id="t1"),
            make_event(
                run_id="r1", kind="artifact", payload={"name": "result"}, task_id="t1"
            ),
        ]
        for e in events:
            store.append(e)

        # Read from SQLite
        sqlite_results = store.query(run_id="r1")

        # Read from JSONL
        jsonl_path = tmp_path / "events.jsonl"
        jsonl_results = [
            EventV1.from_json(line)
            for line in jsonl_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

        assert len(sqlite_results) == len(jsonl_results) == 3
        for sq, jl in zip(sqlite_results, jsonl_results, strict=True):
            assert sq.run_id == jl.run_id
            assert sq.kind == jl.kind
            assert sq.payload == jl.payload
            assert sq.task_id == jl.task_id
        store.close()

    def test_jsonl_valid_json_lines(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        store.append(make_event(run_id="r1", kind="status"))
        store.append(make_event(run_id="r2", kind="error"))

        jsonl_path = tmp_path / "events.jsonl"
        lines = jsonl_path.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 2
        for line in lines:
            parsed = json.loads(line)
            assert isinstance(parsed, dict)
            assert "schema_version" in parsed
        store.close()


class TestStoreInitialization:
    def test_creates_data_dir(self, tmp_path: Path) -> None:
        data_dir = tmp_path / "subdir" / "deep"
        store = EventStore(data_dir)
        assert data_dir.exists()
        assert (data_dir / "events.db").exists()
        store.close()

    def test_reopen_preserves_data(self, tmp_path: Path) -> None:
        store = EventStore(tmp_path)
        store.append(make_event(run_id="r1", kind="status"))
        store.close()

        store2 = EventStore(tmp_path)
        results = store2.query(run_id="r1")
        assert len(results) == 1
        store2.close()
