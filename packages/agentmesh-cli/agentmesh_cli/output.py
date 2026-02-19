from __future__ import annotations

from datetime import UTC
from typing import TYPE_CHECKING, Any

from rich.console import Console
from rich.table import Table

if TYPE_CHECKING:
    from agentmesh_discovery.types import DiscoveredAgent

    from agentmesh_cli.a2a_invoke import InvokeEvent

console = Console()
err_console = Console(stderr=True)


def print_agents_table(agents: list[DiscoveredAgent]) -> None:
    table = Table(title="Discovered Agents")
    table.add_column("Name", style="cyan")
    table.add_column("URL", style="green")
    table.add_column("Source", style="yellow")
    table.add_column("Skills")
    table.add_column("Status", style="bold")

    for agent in agents:
        skills = ""
        if agent.agent_card and agent.agent_card.skills:
            skills = ", ".join(s.name for s in agent.agent_card.skills)
        status = "reachable" if agent.agent_card else "discovered"
        table.add_row(agent.name, agent.agent_card_url, agent.source, skills, status)

    console.print(table)


def print_trace_timeline(events: list[dict[str, Any]], run_id: str) -> None:
    if not events:
        console.print("[dim]No events found.[/dim]")
        return

    first_ts = events[0].get("ts", "")
    first_meta = events[0].get("metadata", {})
    agent_name = (
        first_meta.get("agent_name", "")
        or first_meta.get("agent_url", "")
        or "unknown"
    )

    console.print(
        f"\n[bold]Run:[/bold] {run_id}  "
        f"[bold]Agent:[/bold] {agent_name}  "
        f"[bold]Started:[/bold] {first_ts}\n"
    )

    for event in events:
        ts = event.get("ts", "")
        # Extract time portion (HH:MM:SS.mmm)
        time_part = ts.split("T")[1][:12] if "T" in ts else ts[:12]
        kind = event.get("kind", "?")
        payload = event.get("payload", {})

        detail = ""
        if kind == "message":
            text = payload.get("text", "")
            detail = f'"{text}"' if text else ""
        elif kind == "status":
            detail = payload.get("state", "") or event.get("metadata", {}).get("state", "")
        elif kind == "artifact":
            text = payload.get("text", "")
            detail = f'"{text}"' if text else ""
        elif kind == "tool":
            name = payload.get("name", "")
            phase = payload.get("phase", "")
            detail = f"{name} ({phase})" if phase else name
        elif kind == "error":
            detail = payload.get("message", "")
        else:
            detail = str(payload)[:60] if payload else ""

        console.print(f"  {time_part}  [bold]{kind:<10}[/bold] {detail}")

    # Summary
    last_ts = events[-1].get("ts", "")
    try:
        from datetime import datetime

        t0 = datetime.fromisoformat(first_ts.replace("Z", "+00:00")).replace(tzinfo=UTC)
        t1 = datetime.fromisoformat(last_ts.replace("Z", "+00:00")).replace(tzinfo=UTC)
        duration = (t1 - t0).total_seconds()
        console.print(
            f"\n[bold]Duration:[/bold] {duration:.1f}s  [bold]Events:[/bold] {len(events)}"
        )
    except (ValueError, IndexError):
        console.print(f"\n[bold]Events:[/bold] {len(events)}")


def print_invoke_event(event: InvokeEvent) -> None:
    if event.kind == "text":
        console.print(event.content, end="")
    elif event.kind == "status":
        state = event.metadata.get("state", "")
        console.print(f"[dim][Status: {state}][/dim]")
    elif event.kind == "tool":
        name = event.metadata.get("name", "unknown")
        phase = event.metadata.get("phase", "update")
        console.print(f"[dim][Tool {phase}: {name}][/dim]")
    elif event.kind == "reasoning":
        console.print(f"[dim][Reasoning] {event.content}[/dim]", end="")
    elif event.kind == "artifact":
        console.print(f"\n{event.content}")
    elif event.kind == "error":
        err_console.print(f"[red]Error: {event.content}[/red]")


def print_error(message: str) -> None:
    err_console.print(f"[red]Error: {message}[/red]")


def print_success(message: str) -> None:
    console.print(f"[green]{message}[/green]")


def print_warning(message: str) -> None:
    err_console.print(f"[yellow]Warning: {message}[/yellow]")
