# A2A SDK Adoption

> Status: **Adopted** (M2) — `a2a-sdk >=0.3.22,<0.4.0`

## What Changed (M2)

AgentMesh adopted the official [`a2a-sdk`](https://pypi.org/project/a2a-sdk/) Python package for A2A protocol types and client.

### discovery-py

| Before (M1) | After (M2) |
|---|---|
| Hand-rolled `AgentCard` dataclass | `a2a.types.AgentCard` (Pydantic model) |
| Hand-rolled `AgentSkill` dataclass | `a2a.types.AgentSkill` (Pydantic model) |
| Manual JSON parsing in `fetch_agent_card()` (~25 lines) | `AgentCard.model_validate(data)` (1 line) |
| `httpx >=0.27.0` | `httpx >=0.28.1` (match SDK requirement) |

**Breaking change**: `AgentCard` is now a Pydantic model. Code using `dataclasses.asdict(card)` should use `card.model_dump()` instead.

### py-agent example

| Before (M1) | After (M2) |
|---|---|
| Manual JSON-RPC construction | `ClientFactory.connect()` + `Client.send_message()` |
| Manual `tasks/send` HTTP call | SDK handles protocol details |
| No streaming | `--stream` flag for SSE via `message/stream` |
| ~115 lines | ~100 lines |

### What stays hand-rolled

- **mDNS discovery** (`MdnsDiscovery`, `MdnsAnnouncer`) — AgentMesh-specific, not in SDK
- **Static discovery** (`StaticDiscovery`) — AgentMesh-specific
- **`DiscoveredAgent` dataclass** — AgentMesh-specific wrapper
- **TS plugin types** — TypeScript, not covered by Python SDK

## SDK API Reference

### Key imports

```python
from a2a.client import ClientFactory, ClientConfig, create_text_message_object
from a2a.types import (
    AgentCard, AgentSkill, Message, TextPart, Part, Role,
    MessageSendParams, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent,
)
```

### Creating a client

```python
client = await ClientFactory.connect(
    agent=card,  # AgentCard or base URL string
    client_config=ClientConfig(streaming=True),
)
```

### Sending a message

```python
message = create_text_message_object(Role.user, "Hello")
async for event in client.send_message(request=message):
    if isinstance(event, Message):
        # Direct response
        ...
    elif isinstance(event, tuple):
        task, update = event
        # update is TaskStatusUpdateEvent | TaskArtifactUpdateEvent | None
        ...
```

### Wire format (a2a-sdk 0.3.x)

| Concept | Value |
|---|---|
| Send method | `message/send` |
| Stream method | `message/stream` |
| Get task | `tasks/get` |
| Cancel task | `tasks/cancel` |
| Part discriminator | `kind` (not `type`) |
| Session field | `context_id` (not `sessionId`) |
| Well-known path | `/.well-known/agent-card.json` |
| Protocol version | `"0.3.0"` |

## Transitive Dependencies

Adding `a2a-sdk` brings:
- `pydantic` (v2) — type validation
- `protobuf` — gRPC support
- `google-api-core` — gRPC support
- `httpx-sse` — SSE streaming client

These are heavier than M1's dependency footprint but justified by the streaming and type validation features.
