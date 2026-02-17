"""
AgentMesh demo: discover an A2A agent via mDNS and send a task.

Usage:
    uv run python examples/py-agent/main.py "Hello from AgentMesh!"
    uv run python examples/py-agent/main.py --token my-secret "What is 2+2?"
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid

import httpx

from agentmesh_discovery import DiscoveryManager, MdnsDiscovery


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send an A2A task to a discovered agent")
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

    # Step 3: Send A2A task
    task_id = f"task-{uuid.uuid4().hex[:12]}"
    a2a_request = {
        "jsonrpc": "2.0",
        "id": task_id,
        "method": "tasks/send",
        "params": {
            "id": task_id,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": args.message}],
            },
        },
    }

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"

    print(f"\nSending task: {args.message}")
    print("-" * 40)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            card.url,
            json=a2a_request,
            headers=headers,
            timeout=120.0,
        )

    if resp.status_code == 401:
        print("Error: Unauthorized. Set AGENTMESH_TOKEN or use --token.", file=sys.stderr)
        sys.exit(1)

    if resp.status_code != 200:
        print(f"Error: HTTP {resp.status_code}", file=sys.stderr)
        print(resp.text, file=sys.stderr)
        sys.exit(1)

    result = resp.json()

    # Handle JSON-RPC error
    if "error" in result:
        err = result["error"]
        print(f"A2A Error [{err.get('code')}]: {err.get('message')}", file=sys.stderr)
        sys.exit(1)

    # Print result
    task = result.get("result", {})
    state = task.get("status", {}).get("state", "unknown")
    print(f"Status: {state}")

    artifacts = task.get("artifacts", [])
    for artifact in artifacts:
        for part in artifact.get("parts", []):
            if part.get("type") == "text":
                print(f"\n{part['text']}")


if __name__ == "__main__":
    asyncio.run(main())
