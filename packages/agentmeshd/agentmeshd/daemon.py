from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import uvicorn

from agentmeshd.server import create_app
from agentmeshd.store import EventStore

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8321


def _pid_file(data_dir: Path) -> Path:
    return data_dir / "agentmeshd.pid"


def _log_file(data_dir: Path) -> Path:
    return data_dir / "agentmeshd.log"


def _read_running_pid(pid_path: Path) -> int | None:
    """Read a PID file and check if that process is alive.

    Returns the PID if alive, or ``None`` (cleaning up stale files).
    """
    if not pid_path.exists():
        return None
    try:
        pid = int(pid_path.read_text().strip())
    except ValueError:
        pid_path.unlink(missing_ok=True)
        return None
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        pid_path.unlink(missing_ok=True)
        return None
    except PermissionError:
        pass
    return pid


def start(
    *,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    data_dir: Path | None = None,
    background: bool = False,
) -> None:
    """Start the agentmeshd HTTP server and write a PID file."""
    resolved_dir = data_dir or _default_data_dir()
    resolved_dir.mkdir(parents=True, exist_ok=True)

    if background:
        _start_background(host=host, port=port, data_dir=resolved_dir)
        return

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


def _start_background(
    *,
    host: str,
    port: int,
    data_dir: Path,
) -> None:
    """Spawn agentmeshd as a detached background process."""
    pid_path = _pid_file(data_dir)

    # Check if already running
    existing_pid = _read_running_pid(pid_path)
    if existing_pid is not None:
        print(f"agentmeshd is already running (pid {existing_pid}).")
        return

    log_path = _log_file(data_dir)
    log_fd = log_path.open("a")

    # Re-invoke via the installed entry point (not `python -m`) so it works
    # regardless of which Python interpreter is running the current process.
    exe = shutil.which("agentmeshd")
    if exe is None:
        print("agentmeshd executable not found on PATH.")
        raise SystemExit(1)

    cmd = [
        exe,
        "start",
        "--host", host,
        "--port", str(port),
        "--data-dir", str(data_dir),
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=log_fd,
        stderr=log_fd,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    log_fd.close()

    # Wait briefly for the process to start and write its PID file
    for _ in range(20):
        time.sleep(0.1)
        if proc.poll() is not None:
            print(f"agentmeshd failed to start. Check {log_path}")
            raise SystemExit(1)
        if pid_path.exists():
            break

    if pid_path.exists():
        pid = int(pid_path.read_text().strip())
        print(f"agentmeshd started in background (pid {pid}). Log: {log_path}")
    else:
        print(f"agentmeshd started (pid {proc.pid}). Log: {log_path}")


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
    pid = _read_running_pid(_pid_file(resolved_dir))
    if pid is None:
        return "stopped"
    return f"running (pid {pid})"


def _default_data_dir() -> Path:
    raw = os.environ.get("AGENTMESH_DATA_DIR", "~/.agentmesh")
    return Path(raw).expanduser()


if __name__ == "__main__":
    start(host=sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HOST)
