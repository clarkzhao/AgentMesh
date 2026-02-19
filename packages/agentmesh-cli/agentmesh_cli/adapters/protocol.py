from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Adapter(Protocol):
    @property
    def name(self) -> str: ...

    async def install(self, *, force: bool = False) -> None: ...

    def is_installed(self) -> bool: ...
