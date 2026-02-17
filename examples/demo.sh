#!/bin/bash
set -euo pipefail

# AgentMesh Demo
#
# Prerequisites:
#   - OpenClaw gateway running with agentmesh-a2a plugin
#   - Plugin config should have auth.token set
#     (or auth.allowUnauthenticated: true for local demo)
#
# Usage:
#   AGENTMESH_TOKEN=demo-token ./examples/demo.sh "Hello from AgentMesh!"

cd "$(dirname "$0")/py-agent"
export AGENTMESH_TOKEN="${AGENTMESH_TOKEN:-demo-token}"
uv run python main.py "${@:-Hello from AgentMesh!}"
