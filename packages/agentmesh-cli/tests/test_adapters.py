from __future__ import annotations

import pytest
from agentmesh_cli.adapters.nanoclaw_adapter import NanoClawAdapter
from agentmesh_cli.adapters.openclaw_adapter import OpenClawAdapter
from agentmesh_cli.adapters.protocol import Adapter
from agentmesh_cli.adapters.registry import get_adapter
from agentmesh_cli.errors import AdapterNotFoundError


class TestAdapterProtocol:
    def test_openclaw_is_adapter(self) -> None:
        assert isinstance(OpenClawAdapter(), Adapter)

    def test_nanoclaw_is_adapter(self) -> None:
        assert isinstance(NanoClawAdapter(), Adapter)


class TestRegistry:
    def test_get_openclaw(self) -> None:
        adapter = get_adapter("openclaw")
        assert adapter.name == "openclaw"

    def test_get_nanoclaw(self) -> None:
        adapter = get_adapter("nanoclaw")
        assert adapter.name == "nanoclaw"

    def test_unknown_adapter_raises(self) -> None:
        with pytest.raises(AdapterNotFoundError):
            get_adapter("unknown")


class TestNanoClawAdapter:
    def test_is_not_installed(self) -> None:
        adapter = NanoClawAdapter()
        assert adapter.is_installed() is False

    @pytest.mark.asyncio
    async def test_install_raises(self) -> None:
        adapter = NanoClawAdapter()
        from agentmesh_cli.errors import InstallFailedError

        with pytest.raises(InstallFailedError, match="not yet implemented"):
            await adapter.install()
