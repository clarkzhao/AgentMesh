from __future__ import annotations

from agentmesh_cli.errors import InstallFailedError


class NanoClawAdapter:
    name = "nanoclaw"

    async def install(self, *, force: bool = False) -> None:
        raise InstallFailedError("NanoClaw adapter is not yet implemented.")

    def is_installed(self) -> bool:
        return False
