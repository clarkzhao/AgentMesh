from __future__ import annotations

import json
from pathlib import Path

from agentmesh_discovery.static import StaticDiscovery


class TestStaticDiscovery:
    def test_discovers_agents_from_bootstrap_json(self, tmp_path: Path) -> None:
        bootstrap = tmp_path / "bootstrap.json"
        bootstrap.write_text(
            json.dumps(
                {
                    "agents": [
                        {"name": "Agent1", "url": "http://localhost:18789/.well-known/agent-card.json"},
                        {"name": "Agent2", "url": "http://localhost:18790/.well-known/agent-card.json"},
                    ]
                }
            )
        )

        discovery = StaticDiscovery(bootstrap)
        agents = discovery.discover()

        assert len(agents) == 2
        assert agents[0].name == "Agent1"
        assert agents[0].agent_card_url == "http://localhost:18789/.well-known/agent-card.json"
        assert agents[0].source == "static"
        assert agents[1].name == "Agent2"

    def test_returns_empty_for_missing_file(self) -> None:
        discovery = StaticDiscovery("/nonexistent/bootstrap.json")
        agents = discovery.discover()
        assert agents == []

    def test_skips_entries_without_url(self, tmp_path: Path) -> None:
        bootstrap = tmp_path / "bootstrap.json"
        bootstrap.write_text(json.dumps({"agents": [{"name": "NoUrl"}, {"name": "HasUrl", "url": "http://x"}]}))

        discovery = StaticDiscovery(bootstrap)
        agents = discovery.discover()

        assert len(agents) == 1
        assert agents[0].name == "HasUrl"

    def test_handles_empty_agents_array(self, tmp_path: Path) -> None:
        bootstrap = tmp_path / "bootstrap.json"
        bootstrap.write_text(json.dumps({"agents": []}))

        discovery = StaticDiscovery(bootstrap)
        agents = discovery.discover()
        assert agents == []

    def test_handles_missing_agents_key(self, tmp_path: Path) -> None:
        bootstrap = tmp_path / "bootstrap.json"
        bootstrap.write_text(json.dumps({"other": "data"}))

        discovery = StaticDiscovery(bootstrap)
        agents = discovery.discover()
        assert agents == []
