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

.PHONY: test
test: test-openclaw-plugin test-discovery-py ## Run all tests.

.PHONY: test-openclaw-plugin
test-openclaw-plugin: ## Run TS plugin tests.
	@echo "==> Testing openclaw-plugin"
	pnpm --filter @agentmesh/agentmesh-a2a test

.PHONY: test-discovery-py
test-discovery-py: ## Run Python SDK tests.
	@echo "==> Testing discovery-py"
	uv run --project packages/discovery-py pytest packages/discovery-py/tests

.PHONY: check
check: check-openclaw-plugin check-discovery-py ## Lint + typecheck all.

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

.PHONY: format
format: format-discovery-py ## Format Python (TS has no formatter configured).

.PHONY: format-discovery-py
format-discovery-py: ## Format Python SDK with ruff.
	@echo "==> Formatting discovery-py"
	uv run --project packages/discovery-py ruff format packages/discovery-py

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
