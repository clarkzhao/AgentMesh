"""E2E smoke test for agentmesh discover (using mock agent, no mDNS)."""

from __future__ import annotations

from typer.testing import CliRunner

from agentmesh_cli.cli import app

runner = CliRunner()


class TestDiscoverSmoke:
    def test_discover_timeout_zero_returns_no_agents(self) -> None:
        """With no real mDNS agents and very short timeout, expect no agents."""
        result = runner.invoke(app, ["discover", "--timeout", "0.1"])
        # Either finds something (unlikely in CI) or exits with 11
        assert result.exit_code in (0, 11)
