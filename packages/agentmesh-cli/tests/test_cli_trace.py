from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from agentmesh_cli.cli import app
from agentmesh_cli.errors import ExitCode
from typer.testing import CliRunner

runner = CliRunner()

_SAMPLE_EVENTS = [
    {
        "ts": "2026-02-19T10:00:00.000+00:00",
        "run_id": "r1",
        "kind": "message",
        "payload": {"role": "user", "text": "1+1"},
        "metadata": {"agent_name": "TestAgent"},
    },
    {
        "ts": "2026-02-19T10:00:00.120+00:00",
        "run_id": "r1",
        "kind": "status",
        "payload": {"state": "working"},
        "metadata": {},
    },
    {
        "ts": "2026-02-19T10:00:01.100+00:00",
        "run_id": "r1",
        "kind": "artifact",
        "payload": {"text": "2"},
        "metadata": {},
    },
]


class TestTraceCommand:
    @patch("agentmesh_cli.commands.trace._fetch_trace")
    def test_trace_timeline(self, mock_fetch: AsyncMock) -> None:
        mock_fetch.return_value = (_SAMPLE_EVENTS, "r1")

        result = runner.invoke(app, ["trace", "r1"])
        assert result.exit_code == 0
        assert "r1" in result.output
        assert "message" in result.output
        assert "status" in result.output
        assert "artifact" in result.output

    @patch("agentmesh_cli.commands.trace._fetch_trace")
    def test_trace_json_format(self, mock_fetch: AsyncMock) -> None:
        mock_fetch.return_value = (_SAMPLE_EVENTS, "r1")

        result = runner.invoke(app, ["trace", "r1", "--format", "json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert len(data) == 3

    @patch("agentmesh_cli.commands.trace._fetch_trace")
    def test_trace_no_events(self, mock_fetch: AsyncMock) -> None:
        mock_fetch.return_value = ([], "r1")

        result = runner.invoke(app, ["trace", "r1"])
        assert result.exit_code == ExitCode.GENERAL_ERROR

    def test_trace_daemon_unavailable(self) -> None:
        result = runner.invoke(
            app,
            ["trace", "r1", "--daemon-url", "http://127.0.0.1:1"],
        )
        assert result.exit_code == ExitCode.DAEMON_UNAVAILABLE
