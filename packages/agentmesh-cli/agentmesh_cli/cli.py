from __future__ import annotations

import typer

from agentmesh_cli.commands.discover import discover
from agentmesh_cli.commands.nanoclaw import nanoclaw_app
from agentmesh_cli.commands.openclaw import openclaw_app
from agentmesh_cli.commands.run import run
from agentmesh_cli.commands.trace import trace
from agentmesh_cli.errors import CLIError
from agentmesh_cli.output import print_error

app = typer.Typer(
    name="agentmesh",
    help="AgentMesh CLI — discover, invoke, and trace A2A agents.",
    no_args_is_help=True,
)

app.command()(discover)
app.command()(run)
app.command()(trace)
app.add_typer(openclaw_app)
app.add_typer(nanoclaw_app)


def main() -> None:
    try:
        app()
    except CLIError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None


if __name__ == "__main__":
    main()
