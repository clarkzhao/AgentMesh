from __future__ import annotations

from agentmeshd.events import SCHEMA_VERSION, EventV1, make_event


class TestEventV1Roundtrip:
    def test_to_dict_and_back(self) -> None:
        event = make_event(
            run_id="r1",
            kind="status",
            payload={"state": "working"},
            task_id="t1",
            step="analyze",
            metadata={"key": "val"},
            team_run_id="tr1",
        )
        d = event.to_dict()
        restored = EventV1.from_dict(d)
        assert restored == event

    def test_to_json_and_back(self) -> None:
        event = make_event(run_id="r2", kind="message", payload={"role": "agent"})
        line = event.to_json()
        restored = EventV1.from_json(line)
        assert restored == event

    def test_schema_version_set(self) -> None:
        event = make_event(run_id="r3", kind="error")
        assert event.schema_version == SCHEMA_VERSION

    def test_defaults(self) -> None:
        event = make_event(run_id="r4", kind="tool")
        assert event.task_id is None
        assert event.step is None
        assert event.payload == {}
        assert event.metadata == {}
        assert event.team_run_id is None


class TestLegacyFormatPromotion:
    def test_event_type_promoted_to_kind(self) -> None:
        legacy = {
            "ts": "2026-01-01T00:00:00Z",
            "run_id": "r1",
            "event_type": "status",
            "task_id": "t1",
            "step": None,
            "message": "hello",
            "metadata": {},
        }
        event = EventV1.from_dict(legacy)
        assert event.kind == "status"
        assert event.payload == {"text": "hello"}
        assert event.schema_version == SCHEMA_VERSION

    def test_legacy_message_none(self) -> None:
        legacy = {
            "ts": "2026-01-01T00:00:00Z",
            "run_id": "r1",
            "event_type": "error",
            "task_id": None,
            "step": None,
            "message": None,
            "metadata": {"code": 500},
        }
        event = EventV1.from_dict(legacy)
        assert event.payload == {}
        assert event.metadata == {"code": 500}

    def test_legacy_message_dict(self) -> None:
        legacy = {
            "ts": "2026-01-01T00:00:00Z",
            "run_id": "r1",
            "event_type": "tool",
            "message": {"name": "exec", "phase": "start"},
            "metadata": {},
        }
        event = EventV1.from_dict(legacy)
        assert event.payload == {"name": "exec", "phase": "start"}

    def test_new_format_not_promoted(self) -> None:
        data = {
            "schema_version": "1",
            "ts": "2026-01-01T00:00:00Z",
            "run_id": "r1",
            "kind": "artifact",
            "task_id": "t1",
            "step": None,
            "payload": {"name": "result", "parts": []},
            "metadata": {},
            "team_run_id": None,
        }
        event = EventV1.from_dict(data)
        assert event.kind == "artifact"
        assert event.payload == {"name": "result", "parts": []}


class TestFromDictDefaults:
    def test_missing_fields_get_defaults(self) -> None:
        event = EventV1.from_dict({})
        assert event.ts == ""
        assert event.run_id == ""
        assert event.kind == "error"
        assert event.task_id is None
        assert event.payload == {}
        assert event.metadata == {}
