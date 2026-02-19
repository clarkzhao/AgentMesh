from __future__ import annotations

from agentmesh_cli.adapters.nanoclaw_adapter import NanoClawAdapter
from agentmesh_cli.adapters.openclaw_adapter import OpenClawAdapter
from agentmesh_cli.adapters.protocol import Adapter
from agentmesh_cli.errors import AdapterNotFoundError

_ADAPTERS: dict[str, type[OpenClawAdapter] | type[NanoClawAdapter]] = {
    "openclaw": OpenClawAdapter,
    "nanoclaw": NanoClawAdapter,
}


def get_adapter(name: str) -> Adapter:
    cls = _ADAPTERS.get(name)
    if cls is None:
        raise AdapterNotFoundError(
            f"Unknown adapter '{name}'. Available: {', '.join(_ADAPTERS.keys())}"
        )
    return cls()
