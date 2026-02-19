"""E2E smoke test for agentmesh install commands.

install tests depend on openclaw CLI and local extensions dir.
Marked @local_only to skip in CI.
"""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from agentmesh_cli.cli import app

runner = CliRunner()


class TestInstallSmoke:
    def test_nanoclaw_install_not_implemented(self) -> None:
        """NanoClaw install should always fail with not-implemented message."""
        result = runner.invoke(app, ["nanoclaw", "install"])
        assert result.exit_code == 13
        assert "not yet implemented" in result.output

    @pytest.mark.local_only
    def test_openclaw_install_requires_cli(self) -> None:
        """OpenClaw install should check for openclaw CLI."""
        result = runner.invoke(app, ["openclaw", "install"])
        # Either succeeds (if openclaw installed) or fails with install error
        assert result.exit_code in (0, 13)
