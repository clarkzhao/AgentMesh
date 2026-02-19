# Contributing to AgentMesh

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description>
```

`type` is required. `scope` is optional.

### Types

| Type | Purpose |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructuring, no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, dependencies, maintenance |
| `ci` | CI/CD configuration |

### Scopes

| Scope | Package |
|---|---|
| `discovery-py` | `packages/discovery-py/` |
| `openclaw-plugin` | `packages/openclaw-plugin/` |
| `agentmeshd` | `packages/agentmeshd/` |
| `examples` | `examples/` |
| `docs` | `docs/`, `README.md` |
| `root` | Root config files (`pyproject.toml`, `package.json`, etc.) |

Omit scope for changes spanning multiple packages.

### Examples

```
feat(openclaw-plugin): add tasks/sendSubscribe streaming
fix(discovery-py): handle mDNS timeout on Linux
docs: update README with roadmap section
test(openclaw-plugin): add auth edge case tests
chore(root): bump vitest to v3
refactor: extract shared A2A types
```
