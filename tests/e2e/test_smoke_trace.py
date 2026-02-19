"""E2E smoke test for agentmesh trace (in-process agentmeshd)."""

from __future__ import annotations

import re

from typer.testing import CliRunner

from agentmesh_cli.cli import app

runner = CliRunner()


class TestTraceSmoke:
    def test_trace_after_run(self, daemon_url: str, mock_agent_url: str) -> None:
        """Run an agent call, then trace the run_id."""
        agent_card_url = f"{mock_agent_url}/.well-known/agent-card.json"

        # First, do a run
        run_result = runner.invoke(
            app,
            [
                "run",
                "--agent",
                agent_card_url,
                "--daemon-url",
                daemon_url,
                "Trace test",
            ],
        )
        assert run_result.exit_code == 0

        # Extract run_id from output
        match = re.search(r"run_id:\s*(\S+)", run_result.output)
        assert match, f"run_id not found in output: {run_result.output}"
        run_id = match.group(1)

        # Now trace it
        trace_result = runner.invoke(
            app,
            ["trace", run_id, "--daemon-url", daemon_url],
        )
        assert trace_result.exit_code == 0
        assert "message" in trace_result.output

    def test_trace_unknown_id(self, daemon_url: str) -> None:
        """Trace with unknown ID should fail gracefully."""
        result = runner.invoke(
            app,
            ["trace", "nonexistent-run-id", "--daemon-url", daemon_url],
        )
        assert result.exit_code == 1  # GENERAL_ERROR

    def test_trace_no_daemon(self) -> None:
        """Trace without daemon should exit 10."""
        result = runner.invoke(
            app,
            [
                "trace",
                "any-id",
                "--daemon-url",
                "http://127.0.0.1:1",
            ],
        )
        assert result.exit_code == 10
