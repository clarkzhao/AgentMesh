"""
AgentMesh demo: discover an A2A agent via mDNS and send a message.

Usage:
    uv run python examples/py-agent/main.py "Hello from AgentMesh!"
    uv run python examples/py-agent/main.py --token my-secret "What is 2+2?"
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

import httpx

from a2a.client import ClientConfig, ClientFactory, create_text_message_object
from a2a.types import AgentCard, Message, Role, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent

from agentmesh_discovery import DiscoveryManager, MdnsDiscovery


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send an A2A message to a discovered agent")
    parser.add_argument("message", nargs="?", default="Hello from AgentMesh!")
    parser.add_argument("--token", default=os.environ.get("AGENTMESH_TOKEN", ""))
    parser.add_argument("--timeout", type=float, default=10.0, help="mDNS discovery timeout")
    parser.add_argument("--url", default="", help="Skip mDNS, use this AgentCard URL directly")
    args = parser.parse_args()

    # Step 1: Discover agent
    if args.url:
        agent_card_url = args.url
        print(f"Using provided AgentCard URL: {agent_card_url}")
    else:
        print("Discovering A2A agents via mDNS...")
        discovery = MdnsDiscovery()
        agent = await discovery.discover_one(timeout=args.timeout)

        if agent is None:
            print("No A2A agents found on the network.", file=sys.stderr)
            sys.exit(1)

        print(f"Found agent: {agent.name} at {agent.agent_card_url}")
        agent_card_url = agent.agent_card_url

    # Step 2: Fetch AgentCard
    print(f"Fetching AgentCard from {agent_card_url}...")
    card = await DiscoveryManager.fetch_agent_card(agent_card_url)
    print(f"Agent: {card.name} — {card.description}")
    print(f"A2A endpoint: {card.url}")
    if card.skills:
        print(f"Skills: {', '.join(s.name for s in card.skills)}")

    # Step 3: Create A2A client using SDK
    httpx_client = httpx.AsyncClient(
        headers={"Authorization": f"Bearer {args.token}"} if args.token else {},
        timeout=120.0,
    )
    client_config = ClientConfig(
        streaming=True,
        httpx_client=httpx_client,
    )
    client = await ClientFactory.connect(
        agent=card,
        client_config=client_config,
    )

    # Step 4: Send message
    message = create_text_message_object(Role.user, args.message)
    print(f"\nSending message: {args.message}")
    print("-" * 40)

    try:
        async for event in client.send_message(request=message):
            if isinstance(event, Message):
                # Direct message response
                for part in event.parts:
                    text_content = getattr(part.root, "text", None)
                    if text_content:
                        print(f"\n{text_content}")
            elif isinstance(event, tuple):
                task, update = event
                if isinstance(update, TaskStatusUpdateEvent):
                    print(f"[Status: {update.status.state.value}]", end="")
                    if update.status.message:
                        for part in update.status.message.parts:
                            text_content = getattr(part.root, "text", None)
                            if text_content:
                                print(f" {text_content}", end="")
                    print()
                elif isinstance(update, TaskArtifactUpdateEvent):
                    for part in update.artifact.parts:
                        text_content = getattr(part.root, "text", None)
                        if text_content:
                            print(f"\n{text_content}")
                elif update is None and task:
                    # Final task state
                    print(f"Task completed: {task.status.state.value}")
                    if task.artifacts:
                        for artifact in task.artifacts:
                            for part in artifact.parts:
                                text_content = getattr(part.root, "text", None)
                                if text_content:
                                    print(f"\n{text_content}")
    finally:
        await httpx_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
