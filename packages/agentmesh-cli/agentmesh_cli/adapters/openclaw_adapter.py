from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from agentmesh_cli.errors import InstallFailedError

_CONFIG_FILE = Path("~/.openclaw/openclaw.json").expanduser()


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
            # Force reinstall — dir and config both intact.
            # Sync src/ to preserve node_modules and other state.
            self._sync_src(plugin_src, self._EXTENSION_DIR)
        elif registered and not dir_exists:
            # Broken state — config references plugin but dir is gone.
            # Recreate the full directory.
            self._rsync_full(plugin_src, self._EXTENSION_DIR)
        else:
            # True fresh install — use openclaw CLI to register + copy.
            self._install_via_cli(plugin_src)

        # Ensure node dependencies are installed
        if not (self._EXTENSION_DIR / "node_modules").exists():
            self._install_deps(self._EXTENSION_DIR)

        # Verify installation
        if not self.is_installed():
            raise InstallFailedError(
                "Plugin installation reported success but extension directory not found."
            )

    def _sync_src(self, src: Path, dest: Path) -> None:
        """Sync only src/ into the extension directory (preserves node_modules)."""
        subprocess.run(
            [
                "rsync",
                "-a",
                "--delete",
                f"{src}/src/",
                f"{dest}/src/",
            ],
            check=True,
            capture_output=True,
        )

    def _rsync_full(self, src: Path, dest: Path) -> None:
        """Sync entire plugin source into the extension directory."""
        dest.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "rsync",
                "-a",
                "--exclude",
                "node_modules",
                "--exclude",
                ".vite",
                "--exclude",
                "package-lock.json",
                f"{src}/",
                f"{dest}/",
            ],
            check=True,
            capture_output=True,
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
            subprocess.run(
                [
                    "rsync",
                    "-a",
                    "--exclude",
                    "node_modules",
                    "--exclude",
                    ".vite",
                    "--exclude",
                    "package-lock.json",
                    f"{plugin_src}/",
                    f"{tmpdir}/",
                ],
                check=True,
                capture_output=True,
            )

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
        # Try relative to this file (installed from monorepo)
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
