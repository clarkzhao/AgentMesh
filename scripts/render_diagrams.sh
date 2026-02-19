#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIAGRAMS_DIR="${ROOT_DIR}/docs/diagrams"

if ! command -v plantuml >/dev/null 2>&1; then
  echo "plantuml command not found. Install PlantUML first." >&2
  exit 1
fi

if ! command -v dot >/dev/null 2>&1; then
  echo "dot command not found. Install Graphviz first." >&2
  exit 1
fi

shopt -s nullglob
files=("${DIAGRAMS_DIR}"/*.puml)

if [ ${#files[@]} -eq 0 ]; then
  echo "No PlantUML files found in ${DIAGRAMS_DIR}."
  exit 0
fi

for src in "${files[@]}"; do
  name="$(basename "${src}")"
  echo "Rendering ${name} -> ${name%.puml}.svg"
  plantuml -tsvg -nometadata "${src}"
done
