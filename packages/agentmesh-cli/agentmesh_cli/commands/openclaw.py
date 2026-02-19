from __future__ import annotations

import asyncio
from typing import Annotated

import typer

from agentmesh_cli.errors import ExitCode, InstallFailedError
from agentmesh_cli.output import print_error, print_success

openclaw_app = typer.Typer(name="openclaw", help="OpenClaw framework commands.")


@openclaw_app.command()
def install(
    force: Annotated[bool, typer.Option("--force", help="Force reinstall.")] = False,
) -> None:
    """Install the OpenClaw A2A plugin."""
    from agentmesh_cli.adapters.openclaw_adapter import OpenClawAdapter

    adapter = OpenClawAdapter()
    try:
        asyncio.run(adapter.install(force=force))
    except InstallFailedError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except Exception as e:
        print_error(f"Installation failed: {e}")
        raise typer.Exit(code=ExitCode.INSTALL_FAILED) from None

    print_success("OpenClaw A2A plugin installed successfully.")
