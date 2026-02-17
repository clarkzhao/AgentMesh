# A2A SDK Adoption Roadmap

> Status: **Deferred** (M1 uses hand-rolled A2A types; revisit for M2 streaming)

## Current State (M1)

AgentMesh hand-rolls all A2A protocol concepts:

| Concept | File | Lines |
|---|---|---|
| AgentCard, AgentSkill, DiscoveredAgent dataclasses | `discovery-py/.../types.py` | ~40 |
| AgentCard JSON parsing (camelCase → snake_case) | `discovery-py/.../manager.py` | ~25 |
| JSON-RPC 2.0 request construction (`tasks/send`) | `examples/py-agent/main.py` | ~15 |
| A2A response + error parsing | `examples/py-agent/main.py` | ~20 |
| mDNS `_a2a._tcp` TXT record format | `discovery-py/.../mdns.py`, `announcer.py` | ~20 |

**Dependencies**: `zeroconf`, `httpx[socks]` — lightweight, no Pydantic.

## What `a2a-sdk` Provides

Package: [`a2a-sdk`](https://pypi.org/project/a2a-sdk/) (official Google A2A Python SDK, [source](https://github.com/a2aproject/a2a-python))

### Modules

| Module | What it does |
|---|---|
| `a2a.types` | Pydantic models for all A2A types (AgentCard, Task, Message, Part, Artifact, TaskStatus, SecurityScheme, etc.) |
| `a2a.client` | HTTP + gRPC clients for `tasks/send`, `tasks/get`, `tasks/sendSubscribe` (SSE streaming) |
| `a2a.server` | FastAPI/Starlette server scaffolding for hosting A2A agents |
| `a2a.auth` | Auth interceptors (Bearer, OAuth2, API key) |
| `a2a.grpc` | gRPC transport layer |

### Base Dependencies (no extras)

```
httpx>=0.28.1
httpx-sse>=0.4.0
pydantic>2.11.3
protobuf>5.29.5
google-api-core>1.26.0
```

Notable: `protobuf` and `google-api-core` are pulled in even for types-only use.

### Optional Extras

| Extra | Adds |
|---|---|
| `http-server` | FastAPI, Starlette, sse-starlette |
| `grpc` | grpcio, grpcio-tools, grpcio-reflection |
| `encryption` | cryptography |
| `telemetry` | opentelemetry-api, opentelemetry-sdk |
| `sql` | SQLAlchemy + PostgreSQL/MySQL/SQLite drivers |
| `signing` | PyJWT |

## Adoption Options

### Option 1: Types Only

Use `a2a-sdk` Pydantic models, keep HTTP client and discovery hand-rolled.

| Pros | Cons |
|---|---|
| Canonical A2A types — always in sync with spec | Heavy base deps (pydantic, protobuf, google-api-core) even for types |
| Pydantic validation catches malformed responses | Can't cherry-pick just `types.py` without full package |
| Drops ~60 lines of hand-rolled dataclasses + parsing | httpx version pin (`>=0.28.1`) may conflict with ours (`>=0.27.0`) |
| Low migration effort | Still hand-rolling JSON-RPC + HTTP in example |

### Option 2: Types + Client (Recommended for M2)

Use `a2a-sdk` models AND `A2AClient` / `A2ACardResolver`. Keep mDNS discovery as-is.

| Pros | Cons |
|---|---|
| Everything from Option 1 | Same heavy base deps |
| Drops JSON-RPC construction entirely | Client may assume patterns (retry, auth) that conflict with simple Bearer flow |
| `A2ACardResolver` replaces hand-rolled `fetch_agent_card()` | Less control over error handling |
| Built-in SSE/streaming for `tasks/sendSubscribe` (M2) | Example becomes SDK-idiomatic, less transparent for learning |
| Auth interceptors handle Bearer tokens | Tighter coupling to SDK API changes |

### Option 3: Full Adoption

Replace `discovery-py` types, use SDK client, align example entirely.

| Pros | Cons |
|---|---|
| Everything from Options 1+2 | `discovery-py` loses independence — becomes thin wrapper |
| Single source of truth for all A2A types | protobuf + google-api-core in lightweight discovery lib |
| Easiest path to M2 features | mDNS still not in SDK — still maintaining discovery code |
| Community expects standard patterns | Breaking change: `AgentCard` becomes Pydantic model (was dataclass) |

## Comparison Matrix

| | Types only | Types + Client | Full adoption |
|---|---|---|---|
| Hand-rolled code removed | ~60 lines | ~95 lines | ~95 lines + parsing |
| New transitive deps | pydantic, protobuf, google-api-core, httpx-sse | same | same (in discovery-py) |
| Migration effort | Low | Medium | Medium-High |
| M2 streaming readiness | No help | Built-in SSE client | Built-in |
| discovery-py independence | Preserved | Preserved | Lost |
| Breaking for consumers | No | No | Yes |

## Recommendation

**M1 (now)**: Keep as-is. The hand-rolled code is ~95 lines total. Adding `protobuf` + `google-api-core` to a discovery library is disproportionate.

**M2 (streaming)**: Adopt **Option 2 (Types + Client)**. When `tasks/sendSubscribe` is needed, the SDK's SSE client justifies the dependency. At that point:

1. Add `a2a-sdk` to `discovery-py` dependencies (or create a new `a2a-client-py` package)
2. Replace hand-rolled `AgentCard`/`AgentSkill` dataclasses with `a2a.types` Pydantic models
3. Replace manual JSON-RPC construction in example with `A2AClient.send_task()`
4. Keep `MdnsDiscovery`, `StaticDiscovery`, `DiscoveryManager` — these are AgentMesh-specific, not in the SDK

**Watch for**: If `a2a-sdk` drops the `protobuf`/`google-api-core` base requirement (they may split types into a lighter package), Option 1 becomes viable earlier.
