from __future__ import annotations

import pytest
from agentmesh_cli.adapters.nanoclaw_adapter import NanoClawAdapter
from agentmesh_cli.errors import InstallFailedError


class TestNanoClawAdapter:
    def test_is_not_installed(self) -> None:
        adapter = NanoClawAdapter()
        assert adapter.is_installed() is False

    @pytest.mark.asyncio
    async def test_install_raises(self) -> None:
        adapter = NanoClawAdapter()
        with pytest.raises(InstallFailedError, match="not yet implemented"):
            await adapter.install()
