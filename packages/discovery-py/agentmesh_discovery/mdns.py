from __future__ import annotations

import asyncio
import threading
from collections.abc import Callable

from zeroconf import ServiceBrowser, ServiceListener, Zeroconf

from agentmesh_discovery.types import DiscoveredAgent

A2A_SERVICE_TYPE = "_a2a._tcp.local."


class _Listener(ServiceListener):
    def __init__(
        self,
        zc: Zeroconf,
        on_found: Callable[[DiscoveredAgent], None] | None,
        agents: dict[str, DiscoveredAgent],
        lock: threading.Lock,
        loop: asyncio.AbstractEventLoop | None,
        future: asyncio.Future[DiscoveredAgent] | None,
    ) -> None:
        self._zc = zc
        self._on_found = on_found
        self._agents = agents
        self._lock = lock
        self._loop = loop
        self._future = future

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        info = zc.get_service_info(type_, name)
        if info is None:
            return

        txt: dict[str, str] = {}
        if info.properties:
            for k, v in info.properties.items():
                key = k.decode("utf-8")
                val = v.decode("utf-8") if v else ""
                txt[key] = val

        agent_card_url = txt.get("url", "")
        agent_name = txt.get("name", name)

        addresses = info.parsed_addresses()
        host = addresses[0] if addresses else ""

        agent = DiscoveredAgent(
            name=agent_name,
            agent_card_url=agent_card_url,
            host=host,
            port=info.port or 0,
            source="mdns",
            raw_txt=txt,
        )

        with self._lock:
            self._agents[agent_card_url] = agent

        if self._on_found:
            self._on_found(agent)

        # Resolve discover_one future if waiting
        if self._future and not self._future.done() and self._loop:
            self._loop.call_soon_threadsafe(self._future.set_result, agent)

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass


class MdnsDiscovery:
    def __init__(self) -> None:
        self._zc: Zeroconf | None = None
        self._browser: ServiceBrowser | None = None
        self._agents: dict[str, DiscoveredAgent] = {}
        self._lock = threading.Lock()

    @property
    def agents(self) -> list[DiscoveredAgent]:
        with self._lock:
            return list(self._agents.values())

    def start(self, on_found: Callable[[DiscoveredAgent], None] | None = None) -> None:
        self._zc = Zeroconf()
        listener = _Listener(
            zc=self._zc,
            on_found=on_found,
            agents=self._agents,
            lock=self._lock,
            loop=None,
            future=None,
        )
        self._browser = ServiceBrowser(self._zc, A2A_SERVICE_TYPE, listener)

    def stop(self) -> None:
        if self._zc:
            self._zc.close()
            self._zc = None
            self._browser = None

    async def discover_one(self, timeout: float = 5.0) -> DiscoveredAgent | None:
        # Check if we already have agents
        with self._lock:
            if self._agents:
                return next(iter(self._agents.values()))

        loop = asyncio.get_running_loop()
        future: asyncio.Future[DiscoveredAgent] = loop.create_future()

        zc = Zeroconf()
        listener = _Listener(
            zc=zc,
            on_found=None,
            agents=self._agents,
            lock=self._lock,
            loop=loop,
            future=future,
        )
        ServiceBrowser(zc, A2A_SERVICE_TYPE, listener)

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except TimeoutError:
            return None
        finally:
            zc.close()
