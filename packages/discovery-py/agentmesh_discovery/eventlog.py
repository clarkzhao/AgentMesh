from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class EventRecord:
    ts: str
    run_id: str
    event_type: str
    task_id: str | None
    step: str | None
    message: str | None
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "ts": self.ts,
            "run_id": self.run_id,
            "event_type": self.event_type,
            "task_id": self.task_id,
            "step": self.step,
            "message": self.message,
            "metadata": self.metadata,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> EventRecord:
        return EventRecord(
            ts=str(data.get("ts", "")),
            run_id=str(data.get("run_id", "")),
            event_type=str(data.get("event_type", "unknown")),
            task_id=str(data["task_id"]) if data.get("task_id") is not None else None,
            step=str(data["step"]) if data.get("step") is not None else None,
            message=str(data["message"]) if data.get("message") is not None else None,
            metadata=_as_dict(data.get("metadata")),
        )


def _as_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return {str(k): v for k, v in value.items()}  # type: ignore[union-attr]
    return {}


def default_event_log_path() -> Path:
    raw = os.environ.get("AGENTMESH_EVENT_LOG", "~/.agentmesh/events.jsonl")
    return Path(raw).expanduser()


def append_event(record: EventRecord, path: Path | None = None) -> None:
    target = path or default_event_log_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record.to_dict(), ensure_ascii=False))
        f.write("\n")


def load_events(
    path: Path | None = None,
    *,
    limit: int = 200,
    run_id: str | None = None,
    task_id: str | None = None,
) -> list[EventRecord]:
    target = path or default_event_log_path()
    if not target.exists():
        return []

    events: list[EventRecord] = []
    for line in target.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue

        record: dict[str, Any] = dict(payload)  # type: ignore[arg-type]
        event = EventRecord.from_dict(record)
        if run_id and event.run_id != run_id:
            continue
        if task_id and event.task_id != task_id:
            continue
        events.append(event)

    if limit <= 0:
        return events
    return events[-limit:]
