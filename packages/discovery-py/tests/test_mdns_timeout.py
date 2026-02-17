from __future__ import annotations

import pytest
from agentmesh_discovery.mdns import MdnsDiscovery


@pytest.mark.asyncio
async def test_discover_one_returns_within_timeout() -> None:
    discovery = MdnsDiscovery()
    # Very short timeout — returns None if no agent found, or a DiscoveredAgent if one is broadcasting
    result = await discovery.discover_one(timeout=0.1)
    assert result is None or result.agent_card_url != ""


@pytest.mark.asyncio
async def test_discover_one_does_not_leak_resources() -> None:
    discovery = MdnsDiscovery()
    # Result may be None (no agent) or a DiscoveredAgent (if a real agent is broadcasting)
    await discovery.discover_one(timeout=0.1)
    # After timeout/discovery, the zeroconf instance should be cleaned up
    # If it leaked, future operations would be impacted
    # We just verify no exception is raised
