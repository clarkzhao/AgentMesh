from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer

from agentmesh_cli.errors import DiscoveryFailedError, ExitCode
from agentmesh_cli.output import console, print_agents_table, print_error

if TYPE_CHECKING:
    from agentmesh_discovery.types import AgentCard, DiscoveredAgent


def discover(
    timeout: Annotated[float, typer.Option(help="mDNS discovery timeout in seconds.")] = 5.0,
    bootstrap: Annotated[
        Path | None,
        typer.Option(help="Path to bootstrap.json for static discovery."),
    ] = None,
    format: Annotated[
        str, typer.Option("--format", help="Output format: table or json.")
    ] = "table",
) -> None:
    """Discover A2A agents on the local network."""
    try:
        agents = asyncio.run(_discover_agents(timeout=timeout, bootstrap=bootstrap))
    except DiscoveryFailedError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except Exception as e:
        print_error(f"Discovery failed: {e}")
        raise typer.Exit(code=ExitCode.GENERAL_ERROR) from None

    if not agents:
        print_error("No A2A agents found.")
        raise typer.Exit(code=ExitCode.DISCOVERY_FAILED)

    if format == "json":
        output: list[dict[str, object]] = []
        for agent in agents:
            entry: dict[str, object] = {
                "name": agent.name,
                "url": agent.agent_card_url,
                "source": agent.source,
            }
            if agent.agent_card:
                entry["skills"] = [s.name for s in (agent.agent_card.skills or [])]
            output.append(entry)
        console.print_json(json.dumps(output))
    else:
        print_agents_table(agents)


async def _discover_agents(
    *,
    timeout: float,
    bootstrap: Path | None,
) -> list[DiscoveredAgent]:
    from agentmesh_discovery import (
        DiscoveryManager,
        MdnsDiscovery,
        StaticDiscovery,
    )

    manager = DiscoveryManager()

    # mDNS discovery
    mdns = MdnsDiscovery()
    mdns.start()
    await asyncio.sleep(timeout)
    mdns_agents = mdns.agents
    mdns.stop()
    manager.add_agents(mdns_agents)

    # Static discovery
    if bootstrap:
        static = StaticDiscovery(bootstrap)
        static_agents = static.discover()
        manager.add_agents(static_agents)

    # Fetch agent cards concurrently
    agents = manager.agents
    if agents:
        results = await asyncio.gather(
            *[_fetch_card(agent) for agent in agents],
            return_exceptions=True,
        )
        for agent, result in zip(agents, results, strict=True):
            if isinstance(result, BaseException):
                continue
            agent.agent_card = result

    return agents


async def _fetch_card(agent: DiscoveredAgent) -> AgentCard:
    from agentmesh_discovery import DiscoveryManager

    return await DiscoveryManager.fetch_agent_card(agent.agent_card_url)
