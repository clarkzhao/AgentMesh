from __future__ import annotations

import threading
from unittest.mock import MagicMock

from agentmesh_discovery.mdns import MdnsDiscovery, _Listener
from agentmesh_discovery.types import DiscoveredAgent


def _make_service_info(
    name: str = "TestAgent._a2a._tcp.local.",
    host: str = "192.168.1.42",
    port: int = 18789,
    txt: dict[str, str] | None = None,
) -> MagicMock:
    info = MagicMock()
    props = txt or {
        "url": "http://192.168.1.42:18789/.well-known/agent-card.json",
        "name": "TestAgent",
        "v": "1",
    }
    info.properties = {k.encode(): v.encode() for k, v in props.items()}
    info.parsed_addresses.return_value = [host]
    info.port = port
    return info


class TestMdnsDiscovery:
    def test_listener_extracts_agent_from_service_info(self) -> None:
        agents: dict[str, DiscoveredAgent] = {}
        lock = threading.Lock()
        zc = MagicMock()
        zc.get_service_info.return_value = _make_service_info()

        found: list[DiscoveredAgent] = []
        listener = _Listener(
            zc=zc,
            on_found=lambda a: found.append(a),
            agents=agents,
            lock=lock,
            loop=None,
            future=None,
        )

        listener.add_service(zc, "_a2a._tcp.local.", "TestAgent._a2a._tcp.local.")

        assert len(found) == 1
        agent = found[0]
        assert agent.name == "TestAgent"
        assert agent.agent_card_url == "http://192.168.1.42:18789/.well-known/agent-card.json"
        assert agent.host == "192.168.1.42"
        assert agent.port == 18789
        assert agent.source == "mdns"

    def test_listener_handles_missing_service_info(self) -> None:
        agents: dict[str, DiscoveredAgent] = {}
        lock = threading.Lock()
        zc = MagicMock()
        zc.get_service_info.return_value = None

        found: list[DiscoveredAgent] = []
        listener = _Listener(
            zc=zc,
            on_found=lambda a: found.append(a),
            agents=agents,
            lock=lock,
            loop=None,
            future=None,
        )

        listener.add_service(zc, "_a2a._tcp.local.", "Missing._a2a._tcp.local.")

        assert len(found) == 0
        assert len(agents) == 0

    def test_agents_property_returns_list(self) -> None:
        discovery = MdnsDiscovery()
        assert discovery.agents == []

    def test_listener_stores_in_agents_dict(self) -> None:
        agents: dict[str, DiscoveredAgent] = {}
        lock = threading.Lock()
        zc = MagicMock()
        zc.get_service_info.return_value = _make_service_info()

        listener = _Listener(
            zc=zc,
            on_found=None,
            agents=agents,
            lock=lock,
            loop=None,
            future=None,
        )

        listener.add_service(zc, "_a2a._tcp.local.", "TestAgent._a2a._tcp.local.")

        assert len(agents) == 1
        url = "http://192.168.1.42:18789/.well-known/agent-card.json"
        assert url in agents
