from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from agentmesh_cli.cli import app
from agentmesh_cli.errors import ExitCode
from typer.testing import CliRunner

runner = CliRunner()


class TestOpenClawInstall:
    @patch("agentmesh_cli.adapters.openclaw_adapter.OpenClawAdapter")
    def test_install_success(self, mock_adapter_cls: MagicMock) -> None:
        mock_adapter = MagicMock()
        mock_adapter.install = AsyncMock()
        mock_adapter_cls.return_value = mock_adapter

        result = runner.invoke(app, ["openclaw", "install"])
        assert result.exit_code == 0
        assert "installed successfully" in result.output

    @patch("agentmesh_cli.adapters.openclaw_adapter.OpenClawAdapter")
    def test_install_with_force(self, mock_adapter_cls: MagicMock) -> None:
        mock_adapter = MagicMock()
        mock_adapter.install = AsyncMock()
        mock_adapter_cls.return_value = mock_adapter

        result = runner.invoke(app, ["openclaw", "install", "--force"])
        assert result.exit_code == 0
        mock_adapter.install.assert_called_once_with(force=True)

    @patch("agentmesh_cli.adapters.openclaw_adapter.OpenClawAdapter")
    def test_install_failure(self, mock_adapter_cls: MagicMock) -> None:
        from agentmesh_cli.errors import InstallFailedError

        mock_adapter = MagicMock()
        mock_adapter.install = AsyncMock(side_effect=InstallFailedError("no openclaw"))
        mock_adapter_cls.return_value = mock_adapter

        result = runner.invoke(app, ["openclaw", "install"])
        assert result.exit_code == ExitCode.INSTALL_FAILED


class TestNanoClawInstall:
    def test_install_not_implemented(self) -> None:
        result = runner.invoke(app, ["nanoclaw", "install"])
        assert result.exit_code == ExitCode.INSTALL_FAILED
        assert "not yet implemented" in result.output
