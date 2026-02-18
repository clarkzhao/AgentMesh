from __future__ import annotations

from typing import Any

import httpx

from agentmesh_discovery.types import AgentCard, DiscoveredAgent


class DiscoveryManager:
    def __init__(self) -> None:
        self._agents: dict[str, DiscoveredAgent] = {}

    def add_agents(self, agents: list[DiscoveredAgent]) -> None:
        for agent in agents:
            # Deduplicate by agent_card_url
            if agent.agent_card_url not in self._agents:
                self._agents[agent.agent_card_url] = agent

    @property
    def agents(self) -> list[DiscoveredAgent]:
        return list(self._agents.values())

    @staticmethod
    async def fetch_agent_card(url: str) -> AgentCard:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()

        return AgentCard.model_validate(data)
