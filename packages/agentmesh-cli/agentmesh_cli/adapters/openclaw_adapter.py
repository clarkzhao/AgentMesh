from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from agentmesh_cli.errors import InstallFailedError

_CONFIG_FILE = Path("~/.openclaw/openclaw.json").expanduser()

_RSYNC_EXCLUDES = ["node_modules", ".vite", "package-lock.json"]


class OpenClawAdapter:
    name = "openclaw"

    _EXTENSION_DIR = Path("~/.openclaw/extensions/agentmesh-a2a").expanduser()

    async def install(self, *, force: bool = False) -> None:
        dir_exists = self.is_installed()
        registered = self._is_registered()

        if dir_exists and not force:
            raise InstallFailedError(
                "OpenClaw plugin already installed. Use --force to reinstall."
            )

        # Verify openclaw CLI is available
        if not shutil.which("openclaw"):
            raise InstallFailedError(
                "openclaw CLI not found. Install OpenClaw first: https://openclaw.dev"
            )

        # Locate plugin source
        plugin_src = self._find_plugin_source()

        if registered and dir_exists:
            # Force reinstall — sync src/ only to preserve node_modules.
            _rsync(f"{plugin_src}/src/", f"{self._EXTENSION_DIR}/src/", delete=True)
        elif registered and not dir_exists:
            # Broken state — config references plugin but dir is gone.
            self._EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
            _rsync(f"{plugin_src}/", f"{self._EXTENSION_DIR}/")
        else:
            # Fresh install — use openclaw CLI to register + copy.
            self._install_via_cli(plugin_src)

        # Ensure node dependencies are installed
        if not (self._EXTENSION_DIR / "node_modules").exists():
            self._install_deps(self._EXTENSION_DIR)

        # Verify installation
        if not self.is_installed():
            raise InstallFailedError(
                "Plugin installation reported success but extension directory not found."
            )

    def _install_deps(self, dest: Path) -> None:
        """Install node dependencies in the extension directory."""
        pnpm = shutil.which("pnpm")
        npm = shutil.which("npm")
        if pnpm:
            cmd = [pnpm, "install", "--prod"]
        elif npm:
            cmd = [npm, "install", "--omit=dev"]
        else:
            raise InstallFailedError(
                "Neither pnpm nor npm found. Cannot install plugin dependencies."
            )
        result = subprocess.run(
            cmd,
            cwd=dest,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise InstallFailedError(
                f"Failed to install plugin dependencies: {result.stderr.strip()}"
            )

    def _install_via_cli(self, plugin_src: Path) -> None:
        """Install plugin from scratch via openclaw CLI."""
        with tempfile.TemporaryDirectory() as tmpdir:
            _rsync(f"{plugin_src}/", f"{tmpdir}/")

            result = subprocess.run(
                ["openclaw", "plugins", "install", tmpdir],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise InstallFailedError(
                    f"openclaw plugins install failed: {result.stderr.strip()}"
                )

    def is_installed(self) -> bool:
        return self._EXTENSION_DIR.exists()

    def _is_registered(self) -> bool:
        """Check if agentmesh-a2a is referenced in openclaw.json."""
        if not _CONFIG_FILE.is_file():
            return False
        try:
            data = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
            entries: object = data.get("plugins", {}).get("entries", {})
            return isinstance(entries, dict) and "agentmesh-a2a" in entries
        except (json.JSONDecodeError, AttributeError):
            return False

    def _find_plugin_source(self) -> Path:
        """Find the openclaw-plugin source directory in the monorepo."""
        candidates = [
            Path(__file__).resolve().parents[3] / "openclaw-plugin",
            Path.cwd() / "packages" / "openclaw-plugin",
        ]
        for candidate in candidates:
            if (candidate / "package.json").exists():
                return candidate

        raise InstallFailedError(
            "Cannot find packages/openclaw-plugin/ source. Run from the agentmesh monorepo root."
        )


def _rsync(src: str, dest: str, *, delete: bool = False) -> None:
    """Run rsync with standard excludes."""
    cmd = ["rsync", "-a"]
    if delete:
        cmd.append("--delete")
    for exc in _RSYNC_EXCLUDES:
        cmd.extend(["--exclude", exc])
    cmd.extend([src, dest])
    subprocess.run(cmd, check=True, capture_output=True)
