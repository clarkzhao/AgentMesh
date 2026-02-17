from __future__ import annotations

import threading
from unittest.mock import MagicMock

from agentmesh_discovery.mdns import _Listener
from agentmesh_discovery.types import DiscoveredAgent


def _make_service_info(idx: int) -> MagicMock:
    info = MagicMock()
    url = f"http://192.168.1.{idx}:18789/.well-known/agent.json"
    info.properties = {
        b"url": url.encode(),
        b"name": f"Agent{idx}".encode(),
        b"v": b"1",
    }
    info.parsed_addresses.return_value = [f"192.168.1.{idx}"]
    info.port = 18789
    return info


class TestMdnsThreadSafety:
    def test_concurrent_on_found_callbacks(self) -> None:
        agents: dict[str, DiscoveredAgent] = {}
        lock = threading.Lock()

        def make_zc(idx: int) -> MagicMock:
            zc = MagicMock()
            zc.get_service_info.return_value = _make_service_info(idx)
            return zc

        errors: list[Exception] = []

        def add_agent(idx: int) -> None:
            try:
                zc = make_zc(idx)
                listener = _Listener(
                    zc=zc,
                    on_found=None,
                    agents=agents,
                    lock=lock,
                    loop=None,
                    future=None,
                )
                listener.add_service(zc, "_a2a._tcp.local.", f"Agent{idx}._a2a._tcp.local.")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=add_agent, args=(i,)) for i in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert len(agents) == 50
