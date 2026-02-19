# AgentMesh — Agent Instructions

## Project Overview

Monorepo for A2A agent discovery and OpenClaw bridging. Two languages: TypeScript (pnpm) and Python (uv).

## Repository Structure

```text
packages/openclaw-plugin/    # TS: OpenClaw A2A bridge plugin (ESM, vitest)
packages/discovery-py/       # Python: mDNS + static discovery SDK (pytest)
packages/agentmeshd/         # Python: control plane daemon — events, store, HTTP API (pytest)
packages/agentmesh-cli/      # Python: CLI — discover, invoke, trace A2A agents (pytest)
examples/py-agent/           # Demo script using a2a-sdk client
docs/                        # Design and adoption notes
tests/e2e/                   # E2E smoke tests (mock agent + in-process daemon)
```

## Commands

```bash
make prepare                 # Install all dependencies (pnpm + uv)
make test                    # Run all tests (TS + Python)
make check                   # Lint + typecheck all
make format                  # Format Python code
make install-plugin          # Install plugin into OpenClaw
make sync-plugin             # Sync plugin src after code changes
```

Per-package targets:

```bash
make test-openclaw-plugin    # TS plugin tests (vitest)
make test-discovery-py       # Python SDK tests (pytest)
make test-agentmeshd         # agentmeshd tests (pytest)
make test-agentmesh-cli      # CLI unit tests (pytest)
make test-e2e                # E2E smoke tests (mock agent + in-process daemon)
make check-openclaw-plugin   # Typecheck TS plugin
make check-discovery-py      # Lint + typecheck Python SDK
make check-agentmeshd        # Lint + typecheck agentmeshd
make check-agentmesh-cli     # Lint + typecheck CLI
make format-agentmesh-cli    # Format CLI with ruff
```

## Conventions

- **Commits**: Conventional Commits, `<type>(<scope>): <description>`.
  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
  Scopes: `discovery-py`, `openclaw-plugin`, `agentmeshd`, `agentmesh-cli`, `examples`, `docs`, `root`.
  Omit scope for cross-package changes. See `CONTRIBUTING.md`.
- **TS style**: ESM (`"type": "module"`), `.js` extensions in imports, no build step (OpenClaw uses jiti).
- **Python style**: Python 3.12+, ruff lint/format, pyright strict, pytest-asyncio strict mode.
- **Docs sync**: `CLAUDE.md` and `AGENT.md` must stay in sync.
- **License**: Apache 2.0.

## Key Architecture Decisions

- **Dispatch bridge**: OpenClaw integration uses `api.runtime.channel.reply.dispatchReplyFromConfig()` for both sync and streaming paths.
- **Deliver callback contract**: `deliver(payload, info)` places stream kind in `info.kind`; treat `payload` as content only (`payload.text`).
- **JSON-RPC compatibility**: handler accepts both modern and legacy method names:
  `message/send` and `tasks/send`; `message/stream` and `tasks/sendSubscribe`.
- **Streaming envelope**: SSE events are emitted as JSON-RPC envelopes with `result` carrying A2A events.
- **Streaming event mapping**:
  text chunks -> `status-update` (`working`) with incremental message text;
  final text -> `status-update` (`completed`, `final: true`) plus `artifact-update`.
- **Tool/reasoning passthrough**: OpenClaw tool and reasoning callbacks are mapped to `status-update.metadata`:
  `stream_event_type: "tool"` with `tool.{name,phase}`;
  `stream_event_type: "reasoning"` with `reasoning.{text,ended}`.
- **Session keys**: resolved by strategy before dispatch:
  `per-task` (isolated), `per-conversation` (group by `context_id`), `shared` (single key).
- **Multi-agent routing**: resolve `agentId` from `message.metadata.skill_id`; fallback to `session.agentId`.
- **Discovery**: mDNS uses `bonjour-service` (TS) and `zeroconf` (Python) with `_a2a._tcp`.
- **Spec alignment**: A2A v0.3 style fields (`kind`, `context_id`, `message_id`) and task/message endpoints.
- **EventV1 schema**: Canonical event record with `schema_version`, `kind` (status/message/artifact/tool/reasoning/error), `payload` (structured dict), and three-level correlation IDs (`task_id`, `run_id`, `team_run_id`).
- **Dual-write storage**: `EventStore` appends to both JSONL (durability) and SQLite (queryability) atomically. SQLite indexes on `run_id`, `task_id`, `kind`.
- **Legacy EventRecord compat**: `EventV1.from_dict()` auto-detects old format (`event_type` present, `kind` absent) and promotes fields in-place. No migration scripts needed.
- **agentmeshd daemon**: Python (Starlette + uvicorn), PID file in `~/.agentmesh/agentmeshd.pid`, HTTP API on port 8321 by default.
- **agentmesh CLI**: Typer-based CLI (`agentmesh`). Commands: `discover`, `run`, `trace`, `openclaw install`, `nanoclaw install`. Communicates with agentmeshd via `AgentmeshdClient` (httpx). Uses `EventRecorder` for best-effort event recording. Exit codes defined in `ExitCode` enum (0=OK, 10=daemon unavailable, 11=discovery failed, 12=invoke failed, 13=install failed).
- **CLI daemon dependency**: `run` requires daemon by default (exit 10 if unreachable); `--no-daemon` skips check. `trace` always requires daemon. `discover` is daemon-independent.
- **Adapter pattern**: `Adapter` Protocol with `name`, `install()`, `is_installed()`. Only covers install logic; discover/invoke are generic A2A operations. NanoClaw is a stub.

## Installing the Plugin in OpenClaw

```bash
make install-plugin    # First-time install (requires openclaw CLI)
make sync-plugin       # After code changes (rsync --delete removes stale files)
```

## Testing After Changes

Run the relevant suite after edits:
- Changed `packages/openclaw-plugin/src/*.ts` -> `make test-openclaw-plugin`
- Changed `packages/discovery-py/**/*.py` -> `make test-discovery-py`
- Changed `packages/agentmeshd/**/*.py` -> `make test-agentmeshd`
- Changed `packages/agentmesh-cli/**/*.py` -> `make test-agentmesh-cli`
- Changed `tests/e2e/**/*.py` -> `make test-e2e`
- Changed multiple packages -> `make test`
