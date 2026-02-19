from __future__ import annotations

import asyncio

import typer

from agentmesh_cli.errors import ExitCode, InstallFailedError
from agentmesh_cli.output import print_error

nanoclaw_app = typer.Typer(name="nanoclaw", help="NanoClaw framework commands.")


@nanoclaw_app.command()
def install() -> None:
    """Install the NanoClaw A2A adapter."""
    from agentmesh_cli.adapters.nanoclaw_adapter import NanoClawAdapter

    adapter = NanoClawAdapter()
    try:
        asyncio.run(adapter.install())
    except InstallFailedError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except Exception as e:
        print_error(f"Installation failed: {e}")
        raise typer.Exit(code=ExitCode.INSTALL_FAILED) from None
