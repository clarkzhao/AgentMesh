# AgentMesh — Agent Instructions

## Project Overview

Monorepo for A2A agent discovery and OpenClaw bridging. Two languages: TypeScript (pnpm) and Python (uv).

## Repository Structure

```text
packages/openclaw-plugin/    # TS: OpenClaw A2A bridge plugin (ESM, vitest)
packages/discovery-py/       # Python: mDNS + static discovery SDK (pytest)
examples/py-agent/           # Demo script using a2a-sdk client
docs/                        # Design and adoption notes
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
make check-openclaw-plugin   # Typecheck TS plugin
make check-discovery-py      # Lint + typecheck Python SDK
```

## Conventions

- **Commits**: Conventional Commits, `<type>(<scope>): <description>`.
  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
  Scopes: `discovery-py`, `openclaw-plugin`, `examples`, `docs`, `root`.
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

## Installing the Plugin in OpenClaw

```bash
make install-plugin    # First-time install (requires openclaw CLI)
make sync-plugin       # After code changes (rsync --delete removes stale files)
```

## Testing After Changes

Run the relevant suite after edits:
- Changed `packages/openclaw-plugin/src/*.ts` -> `make test-openclaw-plugin`
- Changed `packages/discovery-py/**/*.py` -> `make test-discovery-py`
- Changed both -> `make test`
