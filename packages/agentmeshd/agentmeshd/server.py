from __future__ import annotations

import json
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from agentmeshd.events import SCHEMA_VERSION, EventV1
from agentmeshd.store import EventStore


def create_app(store: EventStore) -> Starlette:
    """Create the Starlette ASGI application with event API routes."""

    async def healthz(_request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    async def get_events(request: Request) -> JSONResponse:
        run_id = request.query_params.get("run_id")
        task_id = request.query_params.get("task_id")
        kind = request.query_params.get("kind")
        limit_raw = request.query_params.get("limit", "200")
        try:
            limit = int(limit_raw)
        except ValueError:
            return JSONResponse({"error": "invalid limit"}, status_code=400)

        events = store.query(run_id=run_id, task_id=task_id, kind=kind, limit=limit)
        return JSONResponse([e.to_dict() for e in events])

    async def post_event(request: Request) -> JSONResponse:
        try:
            body: object = await request.json()
        except json.JSONDecodeError:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)

        if not isinstance(body, dict):
            return JSONResponse({"error": "expected JSON object"}, status_code=400)

        data: dict[str, Any] = dict(body)  # type: ignore[arg-type]
        if not data.get("ts"):
            from datetime import UTC, datetime

            data["ts"] = datetime.now(UTC).isoformat()
        if not data.get("schema_version"):
            data["schema_version"] = SCHEMA_VERSION
        event = EventV1.from_dict(data)
        store.append(event)
        return JSONResponse(event.to_dict(), status_code=201)

    routes = [
        Route("/healthz", healthz, methods=["GET"]),
        Route("/api/events", get_events, methods=["GET"]),
        Route("/api/events", post_event, methods=["POST"]),
    ]

    return Starlette(routes=routes)
