"""E2E smoke test for agentmesh run (mock agent + in-process agentmeshd)."""

from __future__ import annotations

from typer.testing import CliRunner

from agentmesh_cli.cli import app

runner = CliRunner()


class TestRunSmoke:
    def test_run_with_mock_agent(self, daemon_url: str, mock_agent_url: str) -> None:
        """Run against mock agent with daemon, verify output and trace data."""
        agent_card_url = f"{mock_agent_url}/.well-known/agent-card.json"
        result = runner.invoke(
            app,
            [
                "run",
                "--agent",
                agent_card_url,
                "--daemon-url",
                daemon_url,
                "Hello E2E",
            ],
        )
        assert result.exit_code == 0
        assert "run_id:" in result.output

    def test_run_no_daemon_flag(self, mock_agent_url: str) -> None:
        """Run with --no-daemon skips daemon check."""
        agent_card_url = f"{mock_agent_url}/.well-known/agent-card.json"
        result = runner.invoke(
            app,
            [
                "run",
                "--agent",
                agent_card_url,
                "--no-daemon",
                "Hello no-daemon",
            ],
        )
        assert result.exit_code == 0
        assert "run_id:" in result.output

    def test_run_without_daemon_exits_10(self) -> None:
        """Without daemon and without --no-daemon, expect exit code 10."""
        result = runner.invoke(
            app,
            [
                "run",
                "--agent",
                "http://localhost:1/.well-known/agent-card.json",
                "--daemon-url",
                "http://127.0.0.1:1",
                "hello",
            ],
        )
        assert result.exit_code == 10
