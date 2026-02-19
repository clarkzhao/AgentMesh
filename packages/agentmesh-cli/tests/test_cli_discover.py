from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

from agentmesh_cli.cli import app
from typer.testing import CliRunner

runner = CliRunner()


def _make_agent(
    name: str = "TestAgent",
    url: str = "http://localhost:18789/.well-known/agent-card.json",
    source: str = "mdns",
) -> MagicMock:
    agent = MagicMock()
    agent.name = name
    agent.agent_card_url = url
    agent.source = source
    agent.agent_card = None
    return agent


class TestDiscoverCommand:
    @patch("agentmesh_cli.commands.discover._discover_agents")
    def test_discover_finds_agents_table(self, mock_discover: AsyncMock) -> None:
        agent = _make_agent()
        mock_discover.return_value = [agent]

        result = runner.invoke(app, ["discover", "--timeout", "0.1"])
        assert result.exit_code == 0
        assert "TestAgent" in result.output

    @patch("agentmesh_cli.commands.discover._discover_agents")
    def test_discover_json_format(self, mock_discover: AsyncMock) -> None:
        agent = _make_agent()
        agent.agent_card = None
        mock_discover.return_value = [agent]

        result = runner.invoke(app, ["discover", "--timeout", "0.1", "--format", "json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert len(data) == 1
        assert data[0]["name"] == "TestAgent"

    @patch("agentmesh_cli.commands.discover._discover_agents")
    def test_discover_no_agents(self, mock_discover: AsyncMock) -> None:
        mock_discover.return_value = []

        result = runner.invoke(app, ["discover", "--timeout", "0.1"])
        assert result.exit_code == 11  # DISCOVERY_FAILED

    @patch("agentmesh_cli.commands.discover._discover_agents")
    def test_discover_with_agent_card(self, mock_discover: AsyncMock) -> None:
        agent = _make_agent()
        card = MagicMock()
        skill = MagicMock()
        skill.name = "Chat"
        card.skills = [skill]
        agent.agent_card = card
        mock_discover.return_value = [agent]

        result = runner.invoke(app, ["discover", "--timeout", "0.1"])
        assert result.exit_code == 0
        assert "Chat" in result.output
