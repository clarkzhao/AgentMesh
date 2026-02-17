from __future__ import annotations

from typing import Any, cast

import httpx

from agentmesh_discovery.types import AgentCard, AgentSkill, DiscoveredAgent


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

        skills: list[AgentSkill] = []
        for s in data.get("skills", []):
            if isinstance(s, dict):
                s_dict = cast(dict[str, Any], s)
                skills.append(
                    AgentSkill(
                        id=str(s_dict.get("id", "")),
                        name=str(s_dict.get("name", "")),
                        description=str(s_dict.get("description", "")),
                    )
                )

        return AgentCard(
            name=str(data.get("name", "")),
            url=str(data.get("url", "")),
            version=str(data.get("version", "")),
            description=str(data.get("description", "")),
            capabilities=data.get("capabilities", {}),
            skills=skills,
            security_schemes=data.get("securitySchemes", {}),
            default_input_modes=data.get("defaultInputModes", ["text"]),
            default_output_modes=data.get("defaultOutputModes", ["text"]),
        )
