from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from agentmesh_discovery.types import DiscoveredAgent


class StaticDiscovery:
    def __init__(self, bootstrap_path: str | Path) -> None:
        self._path = Path(bootstrap_path)

    def discover(self) -> list[DiscoveredAgent]:
        if not self._path.exists():
            return []

        data: dict[str, Any] = json.loads(self._path.read_text())
        agents_data: list[Any] = data.get("agents", [])

        agents: list[DiscoveredAgent] = []
        for entry in agents_data:
            if not isinstance(entry, dict):
                continue
            entry_dict = cast(dict[str, Any], entry)
            name = str(entry_dict.get("name", ""))
            url = str(entry_dict.get("url", ""))
            if not url:
                continue
            agents.append(
                DiscoveredAgent(
                    name=name,
                    agent_card_url=url,
                    source="static",
                )
            )

        return agents
