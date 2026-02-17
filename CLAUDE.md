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

### TypeScript (openclaw-plugin)

```bash
# Run tests (56 tests)
pnpm --filter @agentmesh/agentmesh-a2a test

# Type check
pnpm --filter @agentmesh/agentmesh-a2a typecheck
```

### Python (discovery-py)

```bash
# Run tests (15 tests)
uv run pytest packages/discovery-py/tests

# Lint
uv run ruff check packages/discovery-py

# Type check
uv run pyright packages/discovery-py/agentmesh_discovery
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
rsync -av --exclude node_modules --exclude .vite --exclude package-lock.json \
  packages/openclaw-plugin/ /tmp/agentmesh-a2a/
openclaw plugins install /tmp/agentmesh-a2a
rm -rf /tmp/agentmesh-a2a
```

After code changes, sync with: `cp -R packages/openclaw-plugin/src ~/.openclaw/extensions/agentmesh-a2a/src`

## Testing After Changes

Always run the relevant test suite after modifying code:
- Changed `packages/openclaw-plugin/src/*.ts` → run TS tests
- Changed `packages/discovery-py/**/*.py` → run Python tests
- Changed both → run both
