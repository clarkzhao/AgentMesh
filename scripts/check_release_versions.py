#!/usr/bin/env python3
"""Validate version alignment for AgentMesh release artifacts."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ROOT_PYPROJECT = ROOT / "pyproject.toml"
ROOT_PACKAGE_JSON = ROOT / "package.json"
PLUGIN_PACKAGE_JSON = ROOT / "packages" / "openclaw-plugin" / "package.json"
PYTHON_PACKAGE_PYPROJECTS = (
    ROOT / "packages" / "discovery-py" / "pyproject.toml",
    ROOT / "packages" / "agentmeshd" / "pyproject.toml",
    ROOT / "packages" / "agentmesh-cli" / "pyproject.toml",
)

PEP440_VERSION_RE = re.compile(r"^(?P<base>\d+\.\d+\.\d+)(?:(?P<pre>a|b|rc)(?P<num>\d+))?$")
NPM_VERSION_RE = re.compile(
    r"^(?P<base>\d+\.\d+\.\d+)(?:-(?P<pre>alpha|beta|rc)\.(?P<num>\d+))?$"
)

PEP440_TO_NPM_PRE = {"a": "alpha", "b": "beta", "rc": "rc"}


def read_toml_version(path: Path) -> str:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return str(data["project"]["version"])


def read_json_version(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    return str(data["version"])


def pep440_to_npm(version: str) -> str:
    match = PEP440_VERSION_RE.fullmatch(version)
    if not match:
        raise ValueError(
            "Unsupported Python package version format. Expected `X.Y.Z` or `X.Y.ZaN/bN/rcN`."
        )
    base = match.group("base")
    pre = match.group("pre")
    if not pre:
        return base
    num = match.group("num")
    return f"{base}-{PEP440_TO_NPM_PRE[pre]}.{num}"


def validate_npm_version(version: str) -> bool:
    return bool(NPM_VERSION_RE.fullmatch(version))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate release version alignment across Python and npm packages."
    )
    parser.add_argument(
        "--tag",
        help="Optional git tag to validate (for example: v0.2.1 or v0.2.1-beta.1).",
    )
    args = parser.parse_args()

    errors: list[str] = []

    root_python_version = read_toml_version(ROOT_PYPROJECT)
    root_npm_version = read_json_version(ROOT_PACKAGE_JSON)
    plugin_npm_version = read_json_version(PLUGIN_PACKAGE_JSON)

    try:
        expected_npm_version = pep440_to_npm(root_python_version)
    except ValueError as exc:
        errors.append(f"{ROOT_PYPROJECT}: {exc}")
        expected_npm_version = ""

    if expected_npm_version:
        if root_npm_version != expected_npm_version:
            errors.append(
                f"{ROOT_PACKAGE_JSON}: version `{root_npm_version}` must match `{expected_npm_version}`."
            )
        if plugin_npm_version != expected_npm_version:
            errors.append(
                f"{PLUGIN_PACKAGE_JSON}: version `{plugin_npm_version}` must match `{expected_npm_version}`."
            )
        if not validate_npm_version(root_npm_version):
            errors.append(
                f"{ROOT_PACKAGE_JSON}: version `{root_npm_version}` must be `X.Y.Z` or `X.Y.Z-<alpha|beta|rc>.N`."
            )
        if not validate_npm_version(plugin_npm_version):
            errors.append(
                f"{PLUGIN_PACKAGE_JSON}: version `{plugin_npm_version}` must be `X.Y.Z` or `X.Y.Z-<alpha|beta|rc>.N`."
            )

    for package_pyproject in PYTHON_PACKAGE_PYPROJECTS:
        package_version = read_toml_version(package_pyproject)
        if package_version != root_python_version:
            errors.append(
                f"{package_pyproject}: version `{package_version}` must match `{root_python_version}`."
            )

    if args.tag:
        tag = args.tag.strip()
        if not tag.startswith("v"):
            errors.append(f"Release tag `{tag}` must start with `v`.")
        else:
            tag_version = tag[1:]
            if not validate_npm_version(tag_version):
                errors.append(
                    f"Release tag `{tag}` must be `vX.Y.Z` or `vX.Y.Z-<alpha|beta|rc>.N`."
                )
            elif expected_npm_version and tag_version != expected_npm_version:
                errors.append(
                    f"Release tag `{tag}` does not match expected npm version `v{expected_npm_version}`."
                )

    if errors:
        print("Release version checks failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Release version checks passed.")
    print(f"- Python version: {root_python_version}")
    print(f"- npm version: {expected_npm_version}")
    if args.tag:
        print(f"- tag: {args.tag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
