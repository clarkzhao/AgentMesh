from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx
from a2a.client import ClientConfig, ClientFactory, create_text_message_object
from a2a.types import (
    AgentCard,
    Message,
    Role,
    TaskArtifactUpdateEvent,
    TaskStatusUpdateEvent,
)
from agentmesh_discovery import DiscoveryManager


@dataclass
class InvokeEvent:
    kind: str  # "text" | "status" | "tool" | "reasoning" | "artifact" | "error"
    content: str
    metadata: dict[str, Any] = field(default_factory=lambda: dict[str, Any]())


async def invoke_agent(
    agent_card_url: str,
    message_text: str,
    *,
    token: str | None = None,
    timeout: float = 120.0,
) -> AsyncIterator[InvokeEvent]:
    """Send a message to an A2A agent and yield InvokeEvents."""
    # 1. Fetch AgentCard
    card: AgentCard = await DiscoveryManager.fetch_agent_card(agent_card_url)

    # 2. Create A2A client
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    httpx_client = httpx.AsyncClient(headers=headers, timeout=timeout)
    client_config = ClientConfig(streaming=True, httpx_client=httpx_client)
    client = await ClientFactory.connect(agent=card, client_config=client_config)

    # 3. Send message and yield events
    message = create_text_message_object(Role.user, message_text)
    try:
        async for event in client.send_message(request=message):
            if isinstance(event, Message):
                for part in event.parts:
                    text_content = getattr(part.root, "text", None)
                    if text_content:
                        yield InvokeEvent(kind="text", content=text_content)
            elif isinstance(event, tuple):  # type: ignore[arg-type]
                task, update = event
                if isinstance(update, TaskStatusUpdateEvent):
                    raw_meta: object = update.metadata
                    metadata: dict[str, Any] = (
                        dict(raw_meta)  # type: ignore[arg-type]
                        if isinstance(raw_meta, dict)
                        else {}
                    )
                    stream_event_type = metadata.get("stream_event_type")
                    task_id = task.id if task else None

                    if stream_event_type == "tool":
                        tool: object = metadata.get("tool", {})
                        if isinstance(tool, dict):
                            tool_d: dict[str, Any] = tool  # type: ignore[assignment]
                            yield InvokeEvent(
                                kind="tool",
                                content="",
                                metadata={
                                    "name": str(tool_d.get("name", "unknown")),
                                    "phase": str(tool_d.get("phase", "update")),
                                    "task_id": task_id,
                                },
                            )
                            continue

                    if stream_event_type == "reasoning":
                        reasoning: object = metadata.get("reasoning", {})
                        if isinstance(reasoning, dict):
                            reasoning_d: dict[str, Any] = reasoning  # type: ignore[assignment]
                            text: str | None = reasoning_d.get("text")  # type: ignore[assignment]
                            ended = reasoning_d.get("ended") is True
                            if isinstance(text, str) and text:
                                yield InvokeEvent(
                                    kind="reasoning",
                                    content=text,
                                    metadata={"task_id": task_id},
                                )
                            elif ended:
                                yield InvokeEvent(
                                    kind="reasoning",
                                    content="",
                                    metadata={"ended": True, "task_id": task_id},
                                )
                            continue

                    # Status event
                    state = update.status.state.value
                    text_parts: list[str] = []
                    if update.status.message:
                        for part in update.status.message.parts:
                            text_content = getattr(part.root, "text", None)
                            if text_content:
                                text_parts.append(text_content)

                    yield InvokeEvent(
                        kind="status",
                        content=" ".join(text_parts),
                        metadata={"state": state, "task_id": task_id},
                    )

                elif isinstance(update, TaskArtifactUpdateEvent):
                    task_id = task.id if task else None
                    for part in update.artifact.parts:
                        text_content = getattr(part.root, "text", None)
                        if text_content:
                            yield InvokeEvent(
                                kind="artifact",
                                content=text_content,
                                metadata={"task_id": task_id},
                            )

                elif update is None and task:
                    # Final task state
                    if task.artifacts:
                        for artifact in task.artifacts:
                            for part in artifact.parts:
                                text_content = getattr(part.root, "text", None)
                                if text_content:
                                    yield InvokeEvent(
                                        kind="artifact",
                                        content=text_content,
                                        metadata={
                                            "task_id": task.id,
                                            "final": True,
                                        },
                                    )
                    yield InvokeEvent(
                        kind="status",
                        content="",
                        metadata={
                            "state": task.status.state.value,
                            "task_id": task.id,
                            "final": True,
                        },
                    )
    finally:
        await httpx_client.aclose()
