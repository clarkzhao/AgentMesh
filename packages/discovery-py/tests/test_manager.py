from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agentmesh_discovery.manager import DiscoveryManager
from agentmesh_discovery.types import DiscoveredAgent


class TestDiscoveryManager:
    def test_deduplicates_by_agent_card_url(self) -> None:
        manager = DiscoveryManager()

        mdns_agent = DiscoveredAgent(
            name="Agent1",
            agent_card_url="http://localhost:18789/.well-known/agent-card.json",
            source="mdns",
        )
        static_agent = DiscoveredAgent(
            name="Agent1-Static",
            agent_card_url="http://localhost:18789/.well-known/agent-card.json",
            source="static",
        )

        manager.add_agents([mdns_agent])
        manager.add_agents([static_agent])

        assert len(manager.agents) == 1
        # First one wins
        assert manager.agents[0].source == "mdns"

    def test_keeps_distinct_agents(self) -> None:
        manager = DiscoveryManager()

        agents = [
            DiscoveredAgent(
                name="Agent1",
                agent_card_url="http://host1/.well-known/agent-card.json",
                source="mdns",
            ),
            DiscoveredAgent(
                name="Agent2",
                agent_card_url="http://host2/.well-known/agent-card.json",
                source="static",
            ),
        ]

        manager.add_agents(agents)
        assert len(manager.agents) == 2

    def test_empty_manager_has_no_agents(self) -> None:
        manager = DiscoveryManager()
        assert manager.agents == []


class TestFetchAgentCard:
    @pytest.mark.asyncio()
    async def test_skills_without_tags_get_default(self) -> None:
        """Skills missing 'tags' should still parse (defaults to [])."""
        card_json = {
            "name": "TestAgent",
            "description": "A test agent",
            "url": "http://localhost:18789/a2a",
            "version": "0.2.0",
            "capabilities": {"streaming": False, "pushNotifications": False},
            "defaultInputModes": ["text"],
            "defaultOutputModes": ["text"],
            "skills": [
                {"id": "chat", "name": "Chat", "description": "General conversation"},
            ],
        }
        mock_resp = MagicMock()
        mock_resp.json.return_value = card_json
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("agentmesh_discovery.manager.httpx.AsyncClient", return_value=mock_client):
            card = await DiscoveryManager.fetch_agent_card(
                "http://localhost:18789/.well-known/agent-card.json"
            )
        assert card.name == "TestAgent"
        assert card.skills[0].tags == []
