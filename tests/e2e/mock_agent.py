"""Minimal A2A v0.3 compatible mock agent for E2E testing.

Serves an AgentCard at /.well-known/agent-card.json and handles
message/send at /a2a with a simple echo response.
"""

from __future__ import annotations

import uuid
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

MOCK_AGENT_NAME = "MockAgent"
MOCK_AGENT_PORT = 18799


def _agent_card(base_url: str) -> dict[str, Any]:
    return {
        "name": MOCK_AGENT_NAME,
        "description": "A mock A2A agent for testing",
        "url": f"{base_url}/a2a",
        "version": "0.1.0",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
        "skills": [
            {
                "id": "echo",
                "name": "Echo",
                "description": "Echoes input back",
                "tags": [],
            }
        ],
    }


def create_mock_agent_app(
    base_url: str = f"http://127.0.0.1:{MOCK_AGENT_PORT}",
) -> Starlette:
    async def agent_card_endpoint(_request: Request) -> JSONResponse:
        return JSONResponse(_agent_card(base_url))

    async def a2a_endpoint(request: Request) -> JSONResponse:
        body: dict[str, Any] = await request.json()  # type: ignore[assignment]
        method = body.get("method", "")
        params = body.get("params", {})

        if method in ("message/send", "tasks/send"):
            message = params.get("message", {})
            parts = message.get("parts", [])
            input_text = ""
            for part in parts:
                if isinstance(part, dict) and part.get("kind") == "text":
                    input_text = part.get("text", "")
                    break

            task_id = str(uuid.uuid4())
            context_id = str(uuid.uuid4())
            artifact_id = str(uuid.uuid4())
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "result": {
                        "kind": "task",
                        "id": task_id,
                        "contextId": context_id,
                        "status": {"state": "completed"},
                        "artifacts": [
                            {
                                "artifactId": artifact_id,
                                "parts": [
                                    {
                                        "kind": "text",
                                        "text": f"Echo: {input_text}",
                                    }
                                ],
                            }
                        ],
                    },
                }
            )

        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Unknown method: {method}",
                },
            },
            status_code=200,
        )

    routes = [
        Route(
            "/.well-known/agent-card.json",
            agent_card_endpoint,
            methods=["GET"],
        ),
        Route("/a2a", a2a_endpoint, methods=["POST"]),
    ]

    return Starlette(routes=routes)
