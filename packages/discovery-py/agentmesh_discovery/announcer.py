from __future__ import annotations

import socket

from zeroconf import ServiceInfo, Zeroconf


class MdnsAnnouncer:
    def __init__(self, name: str, port: int, agent_card_url: str) -> None:
        self._name = name
        self._port = port
        self._agent_card_url = agent_card_url
        self._zc: Zeroconf | None = None
        self._info: ServiceInfo | None = None

    def start(self) -> None:
        self._zc = Zeroconf()
        self._info = ServiceInfo(
            "_a2a._tcp.local.",
            f"{self._name}._a2a._tcp.local.",
            addresses=[socket.inet_aton("127.0.0.1")],
            port=self._port,
            properties={
                "url": self._agent_card_url,
                "name": self._name,
                "v": "1",
            },
        )
        self._zc.register_service(self._info)

    def stop(self) -> None:
        if self._zc and self._info:
            self._zc.unregister_service(self._info)
        if self._zc:
            self._zc.close()
            self._zc = None
            self._info = None
