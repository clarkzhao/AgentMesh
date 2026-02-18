from __future__ import annotations

from dataclasses import dataclass, field

from a2a.types import AgentCard as AgentCard
from a2a.types import AgentSkill as AgentSkill

# Re-export SDK types for backward compat
__all__ = ["AgentCard", "AgentSkill", "DiscoveredAgent"]


@dataclass
class DiscoveredAgent:
    name: str
    agent_card_url: str
    host: str = ""
    port: int = 0
    source: str = ""  # "mdns" or "static"
    agent_card: AgentCard | None = None
    raw_txt: dict[str, str] = field(default_factory=lambda: dict[str, str]())
