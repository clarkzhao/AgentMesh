# AgentMesh — Claude Code Instructions

## Project Overview

Monorepo for A2A agent discovery. Two languages: TypeScript (pnpm) and Python (uv).

## Repository Structure

```
packages/openclaw-plugin/    # TS — OpenClaw A2A bridge plugin (ESM, vitest)
packages/discovery-py/       # Python — mDNS + static discovery SDK (pytest)
examples/py-agent/           # Demo script
docs/                        # Roadmap docs
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
make test-openclaw-plugin    # TS plugin tests (56 tests)
make test-discovery-py       # Python SDK tests (15 tests)
make check-openclaw-plugin   # Typecheck TS plugin
make check-discovery-py      # Lint + typecheck Python SDK
```

## Conventions

- **Commits**: Conventional Commits — `<type>(<scope>): <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`. Scopes: `discovery-py`, `openclaw-plugin`, `examples`, `docs`, `root`. Omit scope for cross-package changes. See `CONTRIBUTING.md` for details.
- **TS style**: ESM (`"type": "module"`), `.js` extensions in imports, no build step (OpenClaw uses jiti)
- **Python style**: Python 3.12+, ruff for lint/format, pyright strict, pytest-asyncio strict mode
- **License**: Apache 2.0

## Key Architecture Decisions

- **OpenClaw plugin** uses `api.runtime.channel.reply.dispatchReplyFromConfig()` to bridge A2A tasks to OpenClaw agents. The `deliver` callback signature is `(payload: {text?}, info: {kind})` — `kind` is in the second parameter, NOT in the payload.
- **Session keys** are resolved by strategy before dispatch: `per-task` = isolated, `per-conversation` = grouped by A2A sessionId, `shared` = single session.
- **mDNS** uses `bonjour-service` (TS) and `zeroconf` (Python) for `_a2a._tcp` service type.
- **No `a2a-sdk` dependency yet** — types are hand-rolled. Adoption planned for M2 (see `docs/a2a-sdk_adoption.md`).

## Installing the Plugin in OpenClaw

```bash
make install-plugin    # First-time install (requires openclaw CLI)
make sync-plugin       # After code changes (rsync --delete, removes stale files)
```

## Testing After Changes

Always run the relevant test suite after modifying code:
- Changed `packages/openclaw-plugin/src/*.ts` → `make test-openclaw-plugin`
- Changed `packages/discovery-py/**/*.py` → `make test-discovery-py`
- Changed both → `make test`
