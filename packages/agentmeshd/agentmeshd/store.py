from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from agentmeshd.events import EventV1

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT NOT NULL DEFAULT '1',
    ts TEXT NOT NULL,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    task_id TEXT,
    step TEXT,
    payload TEXT NOT NULL,
    metadata TEXT NOT NULL,
    team_run_id TEXT
)
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind)",
]

_INSERT = """
INSERT INTO events (schema_version, ts, run_id, kind, task_id, step, payload, metadata, team_run_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


class EventStore:
    """Dual-write event store: append-only JSONL + SQLite index."""

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._jsonl_path = data_dir / "events.jsonl"
        self._db_path = data_dir / "events.db"
        self._conn: sqlite3.Connection | None = None
        self._ensure_dir()
        self._init_db()

    def append(self, event: EventV1) -> None:
        """Append an event to both JSONL and SQLite."""
        # JSONL
        with self._jsonl_path.open("a", encoding="utf-8") as f:
            f.write(event.to_json())
            f.write("\n")

        # SQLite
        conn = self._get_conn()
        conn.execute(
            _INSERT,
            (
                event.schema_version,
                event.ts,
                event.run_id,
                event.kind,
                event.task_id,
                event.step,
                json.dumps(event.payload, ensure_ascii=False),
                json.dumps(event.metadata, ensure_ascii=False),
                event.team_run_id,
            ),
        )
        conn.commit()

    def query(
        self,
        *,
        run_id: str | None = None,
        task_id: str | None = None,
        kind: str | None = None,
        limit: int = 200,
    ) -> list[EventV1]:
        """Query events from SQLite with optional filters."""
        clauses: list[str] = []
        params: list[Any] = []

        if run_id is not None:
            clauses.append("run_id = ?")
            params.append(run_id)
        if task_id is not None:
            clauses.append("task_id = ?")
            params.append(task_id)
        if kind is not None:
            clauses.append("kind = ?")
            params.append(kind)

        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT schema_version, ts, run_id, kind, task_id, step, payload, metadata, team_run_id FROM events{where} ORDER BY id"  # noqa: E501

        if limit > 0:
            sql += " LIMIT ?"
            params.append(limit)

        conn = self._get_conn()
        rows = conn.execute(sql, params).fetchall()
        return [self._row_to_event(row) for row in rows]

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def _ensure_dir(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)

    def _init_db(self) -> None:
        conn = self._get_conn()
        conn.execute(_CREATE_TABLE)
        for idx in _CREATE_INDEXES:
            conn.execute(idx)
        conn.commit()

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        return self._conn

    @staticmethod
    def _row_to_event(row: tuple[Any, ...]) -> EventV1:
        return EventV1(
            schema_version=row[0],
            ts=row[1],
            run_id=row[2],
            kind=row[3],
            task_id=row[4],
            step=row[5],
            payload=json.loads(row[6]),
            metadata=json.loads(row[7]),
            team_run_id=row[8],
        )
