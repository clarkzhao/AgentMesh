from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from agentmeshd.daemon import DEFAULT_HOST, DEFAULT_PORT

app = typer.Typer(name="agentmeshd", help="AgentMesh control plane daemon.")

DataDirOption = Annotated[
    Path | None,
    typer.Option("--data-dir", help="Data directory (default: ~/.agentmesh)."),
]


@app.command()
def start(
    host: Annotated[str, typer.Option(help="Bind address.")] = DEFAULT_HOST,
    port: Annotated[int, typer.Option(help="Bind port.")] = DEFAULT_PORT,
    background: Annotated[
        bool,
        typer.Option("--background", "-b", help="Run in background."),
    ] = False,
    data_dir: DataDirOption = None,
) -> None:
    """Start the agentmeshd daemon."""
    from agentmeshd.daemon import start as _start

    if not background:
        typer.echo(f"Starting agentmeshd on {host}:{port}")
    _start(host=host, port=port, data_dir=data_dir, background=background)


@app.command()
def stop(data_dir: DataDirOption = None) -> None:
    """Stop a running agentmeshd daemon."""
    from agentmeshd.daemon import stop as _stop

    if _stop(data_dir=data_dir):
        typer.echo("agentmeshd stopped.")
    else:
        typer.echo("agentmeshd is not running.")
        raise typer.Exit(code=1)


@app.command()
def status(data_dir: DataDirOption = None) -> None:
    """Check whether agentmeshd is running."""
    from agentmeshd.daemon import status as _status

    result = _status(data_dir=data_dir)
    typer.echo(f"agentmeshd: {result}")


if __name__ == "__main__":
    app()
