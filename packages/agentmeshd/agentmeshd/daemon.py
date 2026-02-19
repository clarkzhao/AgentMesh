from __future__ import annotations

import os
import signal
import sys
from pathlib import Path

import uvicorn

from agentmeshd.server import create_app
from agentmeshd.store import EventStore

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8321


def _pid_file(data_dir: Path) -> Path:
    return data_dir / "agentmeshd.pid"


def start(
    *,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    data_dir: Path | None = None,
) -> None:
    """Start the agentmeshd HTTP server and write a PID file."""
    resolved_dir = data_dir or _default_data_dir()
    resolved_dir.mkdir(parents=True, exist_ok=True)

    pid_path = _pid_file(resolved_dir)
    pid_path.write_text(str(os.getpid()))

    store = EventStore(resolved_dir)
    app = create_app(store)

    try:
        uvicorn.run(app, host=host, port=port, log_level="info")
    finally:
        store.close()
        if pid_path.exists():
            pid_path.unlink()


def stop(*, data_dir: Path | None = None) -> bool:
    """Stop a running agentmeshd by sending SIGTERM to the recorded PID.

    Returns True if the signal was sent, False if no daemon was found.
    """
    resolved_dir = data_dir or _default_data_dir()
    pid_path = _pid_file(resolved_dir)

    if not pid_path.exists():
        return False

    try:
        pid = int(pid_path.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        pid_path.unlink(missing_ok=True)
    except (ValueError, ProcessLookupError, PermissionError):
        pid_path.unlink(missing_ok=True)
        return False
    else:
        return True


def status(*, data_dir: Path | None = None) -> str:
    """Check whether agentmeshd is running.

    Returns ``"running"`` with PID or ``"stopped"``.
    """
    resolved_dir = data_dir or _default_data_dir()
    pid_path = _pid_file(resolved_dir)

    if not pid_path.exists():
        return "stopped"

    try:
        pid = int(pid_path.read_text().strip())
    except ValueError:
        pid_path.unlink(missing_ok=True)
        return "stopped"

    try:
        os.kill(pid, 0)  # signal 0 = existence check
    except ProcessLookupError:
        pid_path.unlink(missing_ok=True)
        return "stopped"
    except PermissionError:
        pass

    return f"running (pid {pid})"


def _default_data_dir() -> Path:
    raw = os.environ.get("AGENTMESH_DATA_DIR", "~/.agentmesh")
    return Path(raw).expanduser()


if __name__ == "__main__":
    start(host=sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HOST)
