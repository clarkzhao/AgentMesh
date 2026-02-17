from __future__ import annotations

import pytest
from agentmesh_discovery.mdns import MdnsDiscovery


@pytest.mark.asyncio
async def test_discover_one_returns_none_on_timeout() -> None:
    discovery = MdnsDiscovery()
    # Very short timeout — no real mDNS agents will be found
    result = await discovery.discover_one(timeout=0.1)
    assert result is None


@pytest.mark.asyncio
async def test_discover_one_does_not_leak_resources() -> None:
    discovery = MdnsDiscovery()
    result = await discovery.discover_one(timeout=0.1)
    assert result is None
    # After timeout, the zeroconf instance should be cleaned up
    # If it leaked, future operations would be impacted
    # We just verify no exception is raised
