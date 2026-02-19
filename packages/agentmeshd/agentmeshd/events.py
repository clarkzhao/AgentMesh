from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

VALID_KINDS = frozenset({"status", "message", "artifact", "tool", "reasoning", "error"})

SCHEMA_VERSION = "1"


@dataclass(frozen=True)
class EventV1:
    """Canonical event record for AgentMesh (schema version 1)."""

    schema_version: str
    ts: str
    run_id: str
    kind: str
    task_id: str | None
    step: str | None
    payload: dict[str, Any]
    metadata: dict[str, Any]
    team_run_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "ts": self.ts,
            "run_id": self.run_id,
            "kind": self.kind,
            "task_id": self.task_id,
            "step": self.step,
            "payload": self.payload,
            "metadata": self.metadata,
            "team_run_id": self.team_run_id,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> EventV1:
        """Deserialize from dict, with automatic old-format (EventRecord) promotion.

        Old format detection: if ``event_type`` is present and ``kind`` is absent,
        promote ``event_type`` → ``kind`` and ``message`` (str) → ``payload`` (dict).
        """
        is_legacy = "event_type" in data and "kind" not in data

        if is_legacy:
            kind = str(data.get("event_type", "error"))
            raw_message: object = data.get("message")
            if isinstance(raw_message, str):
                payload: dict[str, Any] = {"text": raw_message}
            elif isinstance(raw_message, dict):
                msg_dict: dict[str, Any] = {str(k): v for k, v in raw_message.items()}  # type: ignore[union-attr]
                payload = msg_dict
            else:
                payload = {}
        else:
            kind = str(data.get("kind", "error"))
            raw_payload: object = data.get("payload")
            payload = _as_dict(raw_payload)

        return EventV1(
            schema_version=str(data.get("schema_version", SCHEMA_VERSION)),
            ts=str(data.get("ts", "")),
            run_id=str(data.get("run_id", "")),
            kind=kind,
            task_id=_opt_str(data.get("task_id")),
            step=_opt_str(data.get("step")),
            payload=payload,
            metadata=_as_dict(data.get("metadata")),
            team_run_id=_opt_str(data.get("team_run_id")),
        )

    @staticmethod
    def from_json(line: str) -> EventV1:
        return EventV1.from_dict(json.loads(line))


def make_event(
    *,
    run_id: str,
    kind: str,
    payload: dict[str, Any] | None = None,
    task_id: str | None = None,
    step: str | None = None,
    metadata: dict[str, Any] | None = None,
    team_run_id: str | None = None,
) -> EventV1:
    """Convenience factory that fills in schema_version and timestamp."""
    return EventV1(
        schema_version=SCHEMA_VERSION,
        ts=datetime.now(UTC).isoformat(),
        run_id=run_id,
        kind=kind,
        task_id=task_id,
        step=step,
        payload=payload or {},
        metadata=metadata or {},
        team_run_id=team_run_id,
    )


def _opt_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _as_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(k): v for k, v in value.items()}  # type: ignore[union-attr]
    return {}
