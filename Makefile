.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available make targets.
	@echo "Available make targets:"
	@awk 'BEGIN { FS = ":.*## " } /^[A-Za-z0-9_.-]+:.*## / { printf "  %-25s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: prepare
prepare: ## Install all dependencies (pnpm + uv).
	@echo "==> Installing TS dependencies"
	pnpm install
	@echo "==> Installing Python dependencies"
	uv sync
	@echo "==> Installing agentmeshd CLI"
	uv tool install --from ./packages/agentmeshd agentmeshd --force --reinstall
	@echo "==> Installing agentmesh CLI"
	uv tool install --from ./packages/agentmesh-cli agentmesh-cli --force --reinstall

.PHONY: test
test: test-openclaw-plugin test-discovery-py test-agentmeshd test-agentmesh-cli ## Run all tests.

.PHONY: test-openclaw-plugin
test-openclaw-plugin: ## Run TS plugin tests.
	@echo "==> Testing openclaw-plugin"
	pnpm --filter @agentmesh/agentmesh-a2a test

.PHONY: test-discovery-py
test-discovery-py: ## Run Python SDK tests.
	@echo "==> Testing discovery-py"
	uv run --project packages/discovery-py pytest packages/discovery-py/tests

.PHONY: test-agentmesh-cli
test-agentmesh-cli: ## Run CLI tests.
	@echo "==> Testing agentmesh-cli"
	uv run --project packages/agentmesh-cli pytest packages/agentmesh-cli/tests

.PHONY: test-e2e
test-e2e: ## Run E2E smoke tests.
	@echo "==> Running E2E tests"
	uv run --project packages/agentmesh-cli pytest tests/e2e -v

.PHONY: check
check: check-openclaw-plugin check-discovery-py check-agentmeshd check-agentmesh-cli ## Lint + typecheck all.

.PHONY: check-openclaw-plugin
check-openclaw-plugin: ## Typecheck TS plugin.
	@echo "==> Typechecking openclaw-plugin"
	pnpm --filter @agentmesh/agentmesh-a2a typecheck

.PHONY: check-discovery-py
check-discovery-py: ## Lint + typecheck Python SDK.
	@echo "==> Linting discovery-py"
	uv run --project packages/discovery-py ruff check packages/discovery-py
	@echo "==> Typechecking discovery-py"
	uv run --project packages/discovery-py pyright packages/discovery-py/agentmesh_discovery

.PHONY: check-agentmesh-cli
check-agentmesh-cli: ## Lint + typecheck CLI.
	@echo "==> Linting agentmesh-cli"
	uv run --project packages/agentmesh-cli ruff check packages/agentmesh-cli
	@echo "==> Typechecking agentmesh-cli"
	uv run --project packages/agentmesh-cli pyright packages/agentmesh-cli/agentmesh_cli

.PHONY: format
format: format-discovery-py format-agentmeshd format-agentmesh-cli ## Format Python (TS has no formatter configured).

.PHONY: format-discovery-py
format-discovery-py: ## Format Python SDK with ruff.
	@echo "==> Formatting discovery-py"
	uv run --project packages/discovery-py ruff format packages/discovery-py

.PHONY: format-agentmesh-cli
format-agentmesh-cli: ## Format CLI with ruff.
	@echo "==> Formatting agentmesh-cli"
	uv run --project packages/agentmesh-cli ruff format packages/agentmesh-cli

.PHONY: test-agentmeshd
test-agentmeshd: ## Run agentmeshd tests.
	@echo "==> Testing agentmeshd"
	uv run --project packages/agentmeshd pytest packages/agentmeshd/tests

.PHONY: check-agentmeshd
check-agentmeshd: ## Lint + typecheck agentmeshd.
	@echo "==> Linting agentmeshd"
	uv run --project packages/agentmeshd ruff check packages/agentmeshd
	@echo "==> Typechecking agentmeshd"
	uv run --project packages/agentmeshd pyright packages/agentmeshd/agentmeshd

.PHONY: format-agentmeshd
format-agentmeshd: ## Format agentmeshd with ruff.
	@echo "==> Formatting agentmeshd"
	uv run --project packages/agentmeshd ruff format packages/agentmeshd

.PHONY: install-plugin
install-plugin: ## Install plugin into OpenClaw (requires openclaw CLI).
	@echo "==> Creating clean copy"
	rsync -av --exclude node_modules --exclude .vite --exclude package-lock.json \
		packages/openclaw-plugin/ /tmp/agentmesh-a2a/
	@echo "==> Installing plugin"
	openclaw plugins install /tmp/agentmesh-a2a
	@echo "==> Cleaning up"
	rm -rf /tmp/agentmesh-a2a

.PHONY: sync-plugin
sync-plugin: ## Sync plugin src to OpenClaw after code changes.
	@echo "==> Syncing plugin source"
	rsync -a --delete packages/openclaw-plugin/src/ ~/.openclaw/extensions/agentmesh-a2a/src/
