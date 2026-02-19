from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from typing import Annotated

import typer

from agentmesh_cli.errors import (
    DaemonUnavailableError,
    DiscoveryFailedError,
    ExitCode,
    InvokeFailedError,
)
from agentmesh_cli.output import (
    console,
    print_error,
    print_invoke_event,
    print_warning,
)


def run(
    message: Annotated[str, typer.Argument(help="Message to send to the agent.")],
    agent: Annotated[
        str | None,
        typer.Option("--agent", help="Agent name or AgentCard URL."),
    ] = None,
    to: Annotated[str | None, typer.Option("--to", help="Alias for --agent.")] = None,
    from_: Annotated[
        str | None,
        typer.Option("--from", help="Sender identity (metadata only)."),
    ] = None,
    token: Annotated[
        str | None,
        typer.Option(help="Bearer token for A2A auth.", envvar="AGENTMESH_TOKEN"),
    ] = None,
    timeout: Annotated[float, typer.Option(help="A2A call timeout in seconds.")] = 120.0,
    no_stream: Annotated[
        bool,
        typer.Option("--no-stream", help="Disable streaming output."),
    ] = False,
    no_daemon: Annotated[
        bool,
        typer.Option("--no-daemon", help="Skip daemon check."),
    ] = False,
    daemon_url: Annotated[
        str | None,
        typer.Option("--daemon-url", help="agentmeshd URL."),
    ] = None,
    format: Annotated[
        str,
        typer.Option("--format", help="Output format: streaming or json."),
    ] = "streaming",
) -> None:
    """Send a message to an A2A agent."""
    resolved_agent = agent or to
    if not resolved_agent:
        print_error("--agent or --to is required.")
        raise typer.Exit(code=ExitCode.USAGE_ERROR)

    try:
        asyncio.run(
            _run_invoke(
                agent_ref=resolved_agent,
                message_text=message,
                token=token,
                timeout=timeout,
                no_daemon=no_daemon,
                daemon_url=daemon_url,
                from_identity=from_,
            )
        )
    except DaemonUnavailableError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except DiscoveryFailedError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except InvokeFailedError as e:
        print_error(str(e))
        raise typer.Exit(code=e.exit_code) from None
    except Exception as e:
        print_error(f"Invoke failed: {e}")
        raise typer.Exit(code=ExitCode.INVOKE_FAILED) from None


async def _run_invoke(
    *,
    agent_ref: str,
    message_text: str,
    token: str | None,
    timeout: float,
    no_daemon: bool,
    daemon_url: str | None,
    from_identity: str | None,
) -> None:
    from agentmesh_cli.a2a_invoke import invoke_agent
    from agentmesh_cli.client import AgentmeshdClient
    from agentmesh_cli.event_recorder import EventRecorder

    # 1. Check daemon connectivity
    client: AgentmeshdClient | None = None
    recorder: EventRecorder

    if no_daemon:
        recorder = EventRecorder(None)
    else:
        client = AgentmeshdClient(base_url=daemon_url)
        recorder = EventRecorder(client)
        if not await recorder.try_connect():
            await client.close()
            raise DaemonUnavailableError(
                "agentmeshd not running — trace will be unavailable. "
                "Start with 'agentmeshd start' or use --no-daemon."
            )

    try:
        # 2. Auto-detect token if not provided
        if token is None:
            token = _resolve_token()

        # 3. Resolve agent URL
        agent_card_url = await _resolve_agent(agent_ref)

        # 3. Generate run_id
        run_id = str(uuid.uuid4())

        # 4. Record message event
        metadata: dict[str, object] = {"agent_url": agent_card_url}
        if from_identity:
            metadata["from"] = from_identity
        await recorder.record(
            run_id=run_id,
            kind="message",
            payload={"role": "user", "text": message_text},
            metadata=metadata,  # type: ignore[arg-type]
        )

        # 5. Invoke agent and stream events
        task_id: str | None = None
        try:
            async for event in invoke_agent(
                agent_card_url,
                message_text,
                token=token,
                timeout=timeout,
            ):
                # Extract task_id from first response event
                event_task_id = event.metadata.get("task_id")
                if event_task_id and task_id is None:
                    task_id = str(event_task_id)

                # Render
                print_invoke_event(event)

                # Record event with structured payload
                event_payload: dict[str, object] = {}
                if event.kind == "status":
                    state = event.metadata.get("state")
                    if state:
                        event_payload["state"] = state
                    if event.content:
                        event_payload["text"] = event.content
                elif event.content:
                    event_payload["text"] = event.content
                await recorder.record(
                    run_id=run_id,
                    kind=event.kind,
                    payload=event_payload,
                    task_id=task_id,
                    metadata=event.metadata,  # type: ignore[arg-type]
                )
        except Exception as e:
            await recorder.record(
                run_id=run_id,
                kind="error",
                payload={"message": str(e)},
                task_id=task_id,
            )
            msg = str(e)
            if "401" in msg:
                msg = (
                    "Authentication failed (401 Unauthorized). "
                    "Use --token, set AGENTMESH_TOKEN, or configure "
                    "auth.token in ~/.openclaw/openclaw.json."
                )
            raise InvokeFailedError(msg) from e

        # 6. Print run_id for trace reference
        console.print(f"\n[dim]run_id: {run_id}[/dim]")
        if task_id:
            console.print(f"[dim]task_id: {task_id}[/dim]")

    finally:
        if client:
            await client.close()


def _resolve_token() -> str | None:
    """Auto-detect auth token from OpenClaw config or token file.

    Resolution order:
    1. ~/.openclaw/state/agentmesh-a2a-token (auto-generated token file)
    2. ~/.openclaw/openclaw.json → plugins.entries.agentmesh-a2a.config.auth.token
    """
    # 1. Auto-generated token file
    token_file = Path("~/.openclaw/state/agentmesh-a2a-token").expanduser()
    if token_file.is_file() and not token_file.is_symlink():
        content = token_file.read_text(encoding="utf-8").strip()
        if content:
            return content

    # 2. OpenClaw config file
    config_file = Path("~/.openclaw/openclaw.json").expanduser()
    if config_file.is_file():
        try:
            data = json.loads(config_file.read_text(encoding="utf-8"))
            token: object = (
                data.get("plugins", {})
                .get("entries", {})
                .get("agentmesh-a2a", {})
                .get("config", {})
                .get("auth", {})
                .get("token")
            )
            if isinstance(token, str) and token:
                return token
        except (json.JSONDecodeError, AttributeError):
            pass

    return None


async def _resolve_agent(agent_ref: str) -> str:
    """Resolve agent reference to an AgentCard URL.

    If it looks like a URL (starts with http), use directly.
    Otherwise, do mDNS discovery and match by name.
    """
    if agent_ref.startswith(("http://", "https://")):
        return agent_ref

    from agentmesh_discovery import MdnsDiscovery

    mdns = MdnsDiscovery()
    agent = await mdns.discover_one(timeout=5.0)
    if agent is None:
        raise DiscoveryFailedError(f"Agent '{agent_ref}' not found via mDNS.")

    # Check name match
    if agent.name.lower() == agent_ref.lower():
        return agent.agent_card_url

    # Also check all agents
    for a in mdns.agents:
        if a.name.lower() == agent_ref.lower():
            return a.agent_card_url

    # If only one agent found, use it with a warning
    if len(mdns.agents) == 1:
        print_warning(
            f"Agent '{agent_ref}' not found. Using '{agent.name}' at {agent.agent_card_url}"
        )
        return agent.agent_card_url

    names = ", ".join(a.name for a in mdns.agents)
    raise DiscoveryFailedError(f"Agent '{agent_ref}' not found. Available: {names}")
