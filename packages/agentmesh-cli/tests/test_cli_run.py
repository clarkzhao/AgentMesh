from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from agentmesh_cli.a2a_invoke import InvokeEvent
from agentmesh_cli.cli import app
from agentmesh_cli.errors import ExitCode
from typer.testing import CliRunner

runner = CliRunner()

_URL = "http://localhost:18789/.well-known/agent-card.json"


class _MockInvokeIterator:
    """Helper to create an async iterator of InvokeEvents."""

    def __init__(self, events: list[InvokeEvent]) -> None:
        self._events = events
        self._index = 0

    def __aiter__(self) -> _MockInvokeIterator:
        return self

    async def __anext__(self) -> InvokeEvent:
        if self._index >= len(self._events):
            raise StopAsyncIteration
        event = self._events[self._index]
        self._index += 1
        return event


class TestRunCommand:
    def test_run_requires_agent(self) -> None:
        result = runner.invoke(app, ["run", "hello"])
        assert result.exit_code == ExitCode.USAGE_ERROR

    @patch("agentmesh_cli.a2a_invoke.invoke_agent")
    @patch("agentmesh_cli.event_recorder.EventRecorder")
    @patch("agentmesh_cli.client.AgentmeshdClient")
    def test_run_with_url_and_no_daemon(
        self,
        mock_client_cls: MagicMock,
        mock_recorder_cls: MagicMock,
        mock_invoke: MagicMock,
    ) -> None:
        events = [
            InvokeEvent(
                kind="status",
                content="",
                metadata={"state": "working", "task_id": "t1"},
            ),
            InvokeEvent(
                kind="artifact",
                content="2",
                metadata={"task_id": "t1"},
            ),
            InvokeEvent(
                kind="status",
                content="",
                metadata={
                    "state": "completed",
                    "task_id": "t1",
                    "final": True,
                },
            ),
        ]
        mock_invoke.return_value = _MockInvokeIterator(events)

        mock_recorder = MagicMock()
        mock_recorder.try_connect = AsyncMock(return_value=False)
        mock_recorder.record = AsyncMock()
        mock_recorder_cls.return_value = mock_recorder

        result = runner.invoke(
            app,
            ["run", "--agent", _URL, "--no-daemon", "1+1"],
        )
        assert result.exit_code == 0
        assert "run_id:" in result.output

    def test_run_daemon_required_by_default(self) -> None:
        result = runner.invoke(
            app,
            ["run", "--agent", _URL, "--daemon-url", "http://127.0.0.1:1", "hello"],
        )
        assert result.exit_code == ExitCode.DAEMON_UNAVAILABLE

    @patch("agentmesh_cli.a2a_invoke.invoke_agent")
    @patch("agentmesh_cli.event_recorder.EventRecorder")
    @patch("agentmesh_cli.client.AgentmeshdClient")
    def test_run_records_events_to_daemon(
        self,
        mock_client_cls: MagicMock,
        mock_recorder_cls: MagicMock,
        mock_invoke: MagicMock,
    ) -> None:
        events = [
            InvokeEvent(
                kind="status",
                content="",
                metadata={
                    "state": "completed",
                    "task_id": "t1",
                    "final": True,
                },
            ),
        ]
        mock_invoke.return_value = _MockInvokeIterator(events)

        mock_client = MagicMock()
        mock_client.close = AsyncMock()
        mock_client_cls.return_value = mock_client

        mock_recorder = MagicMock()
        mock_recorder.try_connect = AsyncMock(return_value=True)
        mock_recorder.record = AsyncMock()
        mock_recorder_cls.return_value = mock_recorder

        result = runner.invoke(
            app,
            ["run", "--agent", _URL, "hello"],
        )
        assert result.exit_code == 0
        # Should have recorded message + response events
        assert mock_recorder.record.call_count >= 2
