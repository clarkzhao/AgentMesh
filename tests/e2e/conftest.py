"""E2E test fixtures: in-process agentmeshd + mock A2A agent."""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
import uvicorn

from agentmeshd.server import create_app as create_daemon_app
from agentmeshd.store import EventStore

from .mock_agent import MOCK_AGENT_PORT, create_mock_agent_app


def pytest_configure(config: Any) -> None:
    config.addinivalue_line("markers", "local_only: skip in CI environments")


def pytest_collection_modifyitems(config: Any, items: list[Any]) -> None:
    if os.environ.get("CI") == "true":
        skip_ci = pytest.mark.skip(reason="local_only: skipped in CI")
        for item in items:
            if "local_only" in item.keywords:
                item.add_marker(skip_ci)


@pytest.fixture(scope="session")
def daemon_url(tmp_path_factory: pytest.TempPathFactory) -> Generator[str, None, None]:
    """Start an in-process agentmeshd and return its URL."""
    data_dir = tmp_path_factory.mktemp("agentmeshd")
    store = EventStore(data_dir)
    app = create_daemon_app(store)

    port = 18321  # Use non-default port for E2E
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for server to be ready
    url = f"http://127.0.0.1:{port}"
    _wait_for_server(url)

    yield url

    server.should_exit = True
    thread.join(timeout=5)
    store.close()


@pytest.fixture(scope="session")
def mock_agent_url() -> Generator[str, None, None]:
    """Start an in-process mock A2A agent and return its base URL."""
    base_url = f"http://127.0.0.1:{MOCK_AGENT_PORT}"
    app = create_mock_agent_app(base_url)

    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=MOCK_AGENT_PORT, log_level="warning"
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    _wait_for_server(base_url)

    yield base_url

    server.should_exit = True
    thread.join(timeout=5)


def _wait_for_server(url: str, timeout: float = 5.0) -> None:
    """Poll until the server responds."""
    import httpx

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(f"{url}/healthz" if "8321" in url else f"{url}/.well-known/agent-card.json", timeout=1.0)
            if resp.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.1)
    raise TimeoutError(f"Server at {url} did not start within {timeout}s")
