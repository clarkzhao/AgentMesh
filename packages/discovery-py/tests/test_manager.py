from __future__ import annotations

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
