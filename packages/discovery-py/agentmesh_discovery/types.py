from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentSkill:
    id: str
    name: str
    description: str


@dataclass
class AgentCard:
    name: str
    url: str
    version: str = ""
    description: str = ""
    capabilities: dict[str, Any] = field(default_factory=lambda: dict[str, Any]())
    skills: list["AgentSkill"] = field(default_factory=lambda: list["AgentSkill"]())
    security_schemes: dict[str, Any] = field(default_factory=lambda: dict[str, Any]())
    default_input_modes: list[str] = field(default_factory=lambda: ["text"])
    default_output_modes: list[str] = field(default_factory=lambda: ["text"])


@dataclass
class DiscoveredAgent:
    name: str
    agent_card_url: str
    host: str = ""
    port: int = 0
    source: str = ""  # "mdns" or "static"
    agent_card: "AgentCard | None" = None
    raw_txt: dict[str, str] = field(default_factory=lambda: dict[str, str]())
