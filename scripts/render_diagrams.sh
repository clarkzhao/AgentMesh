#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIAGRAMS_DIR="${ROOT_DIR}/docs/diagrams"
PLANTUML_VERSION="${PLANTUML_VERSION:-1.2026.1}"
PLANTUML_JAR="${PLANTUML_JAR:-${ROOT_DIR}/.cache/plantuml/plantuml-${PLANTUML_VERSION}.jar}"
PLANTUML_URL="${PLANTUML_URL:-https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar}"

if ! command -v java >/dev/null 2>&1; then
  echo "java command not found. Install a JRE/JDK first." >&2
  exit 1
fi

if ! command -v dot >/dev/null 2>&1; then
  echo "dot command not found. Install Graphviz first." >&2
  exit 1
fi

if [ ! -f "${PLANTUML_JAR}" ]; then
  echo "Downloading PlantUML ${PLANTUML_VERSION}..."
  mkdir -p "$(dirname "${PLANTUML_JAR}")"
  curl -fsSL "${PLANTUML_URL}" -o "${PLANTUML_JAR}"
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
  java -jar "${PLANTUML_JAR}" -tsvg -nometadata "${src}"
done
