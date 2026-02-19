from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any

import typer

from agentmesh_cli.errors import DaemonUnavailableError, ExitCode
from agentmesh_cli.output import console, print_error, print_trace_timeline


def trace(
    id: Annotated[str, typer.Argument(help="Task ID or Run ID to trace.")],
    format: Annotated[
        str,
        typer.Option("--format", help="Output format: timeline or json."),
    ] = "timeline",
    daemon_url: Annotated[
        str | None,
        typer.Option("--daemon-url", help="agentmeshd URL."),
    ] = None,
) -> None:
    """View the event trace for a task or run."""
    try:
        events, resolved_id = asyncio.run(_fetch_trace(id=id, daemon_url=daemon_url))
    except DaemonUnavailableError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except Exception as e:
        print_error(f"Trace failed: {e}")
        raise typer.Exit(code=ExitCode.GENERAL_ERROR) from None

    if not events:
        print_error(f"No events found for '{id}'.")
        raise typer.Exit(code=ExitCode.GENERAL_ERROR)

    if format == "json":
        console.print_json(json.dumps(events))
    else:
        print_trace_timeline(events, resolved_id)


async def _fetch_trace(
    *,
    id: str,
    daemon_url: str | None,
) -> tuple[list[dict[str, Any]], str]:
    from agentmesh_cli.client import AgentmeshdClient

    client = AgentmeshdClient(base_url=daemon_url)
    try:
        if not await client.healthz():
            raise DaemonUnavailableError(
                "agentmeshd not running — trace requires daemon. Start with 'agentmeshd start'."
            )

        # Try as run_id first
        events = await client.get_events(run_id=id)
        if events:
            return events, id

        # Try as task_id, then re-fetch by run_id for the complete set
        events = await client.get_events(task_id=id)
        if events:
            run_id = events[0].get("run_id", "")
            if run_id:
                full_events = await client.get_events(run_id=run_id)
                if full_events:
                    return full_events, run_id
            return events, id

        return [], id
    finally:
        await client.close()
