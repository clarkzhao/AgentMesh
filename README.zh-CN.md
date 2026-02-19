# AgentMesh

[English](./README.md) | [简体中文](./README.zh-CN.md)

AgentMesh 是一个面向 A2A Agent 的发现与互联层。它让不同框架（如 OpenClaw、NanoClaw）的 Agent 通过 mDNS 自动发现，并通过 [A2A 协议](https://google.github.io/A2A/)通信。

## 功能（M2）

- 局域网自动发现：基于 mDNS（`_a2a._tcp`）
- 静态发现：支持 `bootstrap.json`
- OpenClaw A2A 桥接：提供 AgentCard 与 `/a2a` JSON-RPC
- SSE 流式响应：`message/stream` 支持文本、工具状态、推理元数据
- 多 Agent 路由：根据 `skill_id` 路由到不同 Agent identity
- 非文本消息支持：`file`/`data` 自动转为文本表示
- 任务取消：支持 `tasks/cancel`
- 鉴权：Bearer Token（可自动生成或显式配置）
- 会话策略：`per-task`、`per-conversation`、`shared`
- Python SDK：`agentmesh-discovery`（基于官方 `a2a-sdk` 类型）
- 对齐 A2A v0.3：`kind`、`context_id`、`message_id`、9 状态任务生命周期

尚未支持：
- WAN/互联网发现（当前仅 LAN）

## 仓库结构

```text
agentmesh/
├── packages/
│   ├── discovery-py/           # Python SDK：mDNS + 静态发现
│   ├── openclaw-plugin/        # OpenClaw 插件：AgentCard + A2A 桥接 + mDNS
│   ├── agentmeshd/             # Python：控制面 daemon、EventV1、JSONL+SQLite
│   ├── agentmesh-cli/          # Python：CLI — 发现、调用、追踪 A2A Agent
│   ├── discovery-ts/           # TS SDK（规划中）
│   ├── registry/               # 注册中心（规划中）
│   └── identity/               # Ed25519 身份（规划中）
├── tests/e2e/                  # E2E 烟测（mock agent + in-process daemon）
├── examples/
│   ├── py-agent/               # 发现 -> 调用 A2A -> 输出结果
│   └── demo.sh
├── .github/workflows/ci.yml    # GitHub Actions CI
├── Makefile
├── package.json
├── pyproject.toml
└── README.md
```

## 快速开始

### 前置要求

- [uv](https://docs.astral.sh/uv/)
- [pnpm](https://pnpm.io/)
- [OpenClaw](https://github.com/nichochar/openclaw) `>=2026.1.0 <2027.0.0`

### 安装依赖

```bash
cd agentmesh
make prepare
```

### 安装 OpenClaw 插件

```bash
make install-plugin
```

在 `~/.openclaw/openclaw.json` 中配置 `plugins.entries.agentmesh-a2a`：

```jsonc
{
  "plugins": {
    "entries": {
      "agentmesh-a2a": {
        "enabled": true,
        "config": {
          "publicBaseUrl": "http://127.0.0.1:18789",
          "agentName": "OpenClaw",
          "auth": {
            "token": "your-secret-token"
          },
          "mdns": true,
          "session": {
            "strategy": "per-task"
          }
        }
      }
    }
  }
}
```

检查插件是否加载：

```bash
openclaw plugins list
```

代码改动后同步插件：

```bash
make sync-plugin
# 然后重启 openclaw gateway
```

### 插件配置说明

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `publicBaseUrl` | string | 必填 | 该 Agent 对外访问地址（不要带尾斜杠） |
| `agentName` | string | `"OpenClaw"` | AgentCard 名称 |
| `agentDescription` | string | `"An OpenClaw agent exposed via A2A"` | AgentCard 描述 |
| `mdns` | boolean | `true` | 是否通过 mDNS 广播 |
| `auth.token` | string | 自动生成 | `/a2a` 的 Bearer Token |
| `auth.allowUnauthenticated` | boolean | `false` | 是否关闭鉴权（不推荐） |
| `session.strategy` | string | `"per-task"` | 会话策略：`per-task` / `per-conversation` / `shared` |
| `session.prefix` | string | `"a2a"` | 会话 key 前缀 |
| `session.agentId` | string | `"main"` | 默认使用的 OpenClaw identity |
| `session.timeoutMs` | number | `120000` | 最长等待时间（仅 `per-task` 生效） |
| `skills` | array | `[{id:"chat",...}]` | AgentCard 技能（单 Agent） |
| `agents` | object | - | 多 Agent 技能路由配置 |

### 运行示例

```bash
# 1) 启动 OpenClaw gateway
openclaw gateway

# 2) 运行 Python 示例（仓库根目录）
AGENTMESH_TOKEN=your-secret-token uv run python examples/py-agent/main.py "What is 2+2?"
```

跳过 mDNS，直接指定 AgentCard URL：

```bash
AGENTMESH_TOKEN=your-secret-token uv run python examples/py-agent/main.py \
  --url http://127.0.0.1:18789/.well-known/agent-card.json "Hello!"
```

## CLI 使用

`agentmesh` CLI 提供统一的命令行界面，用于发现、调用和追踪 A2A Agent。`make prepare` 会自动安装。

### 首次使用路径

```bash
# 1. 启动 daemon（trace 依赖）
agentmeshd start

# 2. 发现局域网 Agent
agentmesh discover

# 3. 向 Agent 发送消息
agentmesh run --agent http://127.0.0.1:18789/.well-known/agent-card.json "1+1 等于多少？"

# 4. 查看事件轨迹
agentmesh trace <run-id>

# 5. 停止 daemon
agentmeshd stop
```

### `agentmesh discover`

扫描局域网 A2A Agent（mDNS），可合并静态引导文件。

```bash
agentmesh discover                           # 默认 5 秒超时，表格输出
agentmesh discover --timeout 10              # 延长扫描时间
agentmesh discover --bootstrap agents.json   # 合并静态条目
agentmesh discover --format json             # JSON 输出
```

退出码：`0`（发现 Agent）、`11`（未发现）。

### `agentmesh run`

向 A2A Agent 发送消息。默认会将事件记录到 `agentmeshd`，供后续追踪。

```bash
# 通过 AgentCard URL 调用
agentmesh run --agent http://127.0.0.1:18789/.well-known/agent-card.json "你好"

# 带鉴权 token
agentmesh run --agent http://127.0.0.1:18789/.well-known/agent-card.json \
  --token my-secret "你好"

# 跳过 daemon（不记录事件）
agentmesh run --agent http://127.0.0.1:18789/.well-known/agent-card.json \
  --no-daemon "你好"

# JSON 输出
agentmesh run --agent http://127.0.0.1:18789/.well-known/agent-card.json \
  --format json "你好"
```

选项：

| 选项 | 说明 |
|---|---|
| `--agent` / `--to` | Agent 名称或 AgentCard URL |
| `--from` | 发送方身份（仅记录到 metadata） |
| `--token` | A2A 鉴权 Bearer Token |
| `--timeout` | A2A 调用超时秒数（默认 120） |
| `--no-stream` | 禁用流式输出 |
| `--no-daemon` | 跳过 daemon 检查，不记录事件 |
| `--daemon-url` | 自定义 agentmeshd 地址 |
| `--format` | `streaming`（默认）或 `json` |

退出码：`0`（成功）、`10`（daemon 不可用）、`11`（Agent 未找到）、`12`（调用失败）。

### `agentmesh trace`

回放某次调用的事件时间线。需要 `agentmeshd` 运行中。

```bash
agentmesh trace <run-id>                     # 时间线输出
agentmesh trace <task-id>                    # 也接受 task ID
agentmesh trace <run-id> --format json       # JSON 输出
```

示例时间线输出：

```
10:00:00.000  message   "1+1 等于多少？"
10:00:00.120  status    working
10:00:01.100  status    completed
10:00:01.100  artifact  "2"
```

退出码：`0`（成功）、`1`（无事件）、`10`（daemon 不可用）。

### `agentmesh openclaw install`

安装 OpenClaw A2A 桥接插件，需要 `openclaw` CLI 可用。

```bash
agentmesh openclaw install           # 安装插件
agentmesh openclaw install --force   # 强制重新安装
```

### `agentmesh nanoclaw install`

NanoClaw 尚未实现，该命令会提示适配器待开发。

## 手动验证

```bash
# AgentCard（公开）
curl http://localhost:18789/.well-known/agent-card.json

# 同步调用（需要 token）
curl -X POST http://localhost:18789/a2a \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-secret-token' \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"id":"t1","message":{"role":"user","parts":[{"kind":"text","text":"Hi"}]}}}'

# 流式调用（SSE）
curl -N -X POST http://localhost:18789/a2a \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-secret-token' \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/stream","params":{"id":"t1","message":{"role":"user","parts":[{"kind":"text","text":"Hi"}]}}}'

# macOS 查看 mDNS 服务
dns-sd -B _a2a._tcp
```

## 主要包

### `packages/discovery-py`

Python 发现 SDK，包含：

- `MdnsDiscovery`：监听 `_a2a._tcp.local.`
- `StaticDiscovery`：读取 `bootstrap.json`
- `DiscoveryManager`：多来源合并去重
- `MdnsAnnouncer`：广播本地 Agent

### `packages/agentmeshd`

AgentMesh 控制面 daemon，提供事件基础设施与 HTTP API：

- **EventV1 schema** — 统一事件模型，6 种类型：`status`、`message`、`artifact`、`tool`、`reasoning`、`error`
- **双写存储** — append-only JSONL + SQLite 索引
- **HTTP API** — `GET /healthz`、`GET /api/events`（查询）、`POST /api/events`（写入）
- **Daemon 管理** — `agentmeshd start`、`agentmeshd stop`、`agentmeshd status`
- **旧格式兼容** — 自动将旧 `EventRecord` 格式提升为 EventV1（`event_type` → `kind`，`message` → `payload`）

### `packages/agentmesh-cli`

AgentMesh 统一 CLI 工具：

- **`agentmesh discover`** — mDNS + 静态 Agent 发现
- **`agentmesh run`** — 调用 Agent，流式输出，同时记录事件
- **`agentmesh trace`** — 回放 agentmeshd 中的事件时间线
- **`agentmesh openclaw install`** — 安装 OpenClaw A2A 桥接插件
- **`agentmesh nanoclaw install`** — 占位（尚未实现）

通过 HTTP 与 `agentmeshd` 通信完成事件记录和查询。使用 `agentmesh-discovery` 发现 Agent，使用 `a2a-sdk` 实现 A2A 协议。

### `packages/agentmesh-cli`

AgentMesh 统一 CLI 工具：

- **`agentmesh discover`** — mDNS + 静态 Agent 发现
- **`agentmesh run`** — 调用 Agent，流式输出并记录事件
- **`agentmesh trace`** — 从 agentmeshd 回放事件时间线
- **`agentmesh openclaw install`** — 安装 OpenClaw A2A 桥接插件
- **`agentmesh nanoclaw install`** — 占位（尚未实现）

通过 HTTP 与 `agentmeshd` 通信，使用 `agentmesh-discovery` 进行发现，使用 `a2a-sdk` 实现 A2A 协议。

### `packages/openclaw-plugin`

OpenClaw A2A 桥接插件，支持：

- `GET /.well-known/agent-card.json`
- `POST /a2a`：`message/send`、`message/stream`、`tasks/get`、`tasks/cancel`
- SSE 事件：`status-update`、`artifact-update`，并携带 tool/reasoning metadata
- 多 Agent 路由、mDNS 广播、Token 鉴权、会话策略

## 开发命令

在仓库根目录执行：

```bash
make prepare
make test
make check
make format
make help
```

按包执行：

```bash
make test-openclaw-plugin    # TS 插件测试（102 tests）
make test-discovery-py       # Python SDK 测试（16 tests）
make test-agentmeshd         # agentmeshd 测试（29 tests）
make test-agentmesh-cli      # CLI 单元测试（34 tests）
make test-e2e                # E2E 烟测（9 tests）
make check-openclaw-plugin   # TS 类型检查
make check-discovery-py      # Python SDK lint + 类型检查
make check-agentmeshd        # agentmeshd lint + 类型检查
make check-agentmesh-cli     # CLI lint + 类型检查
```

## 已知限制（M2）

- 取消是 best-effort：OpenClaw 目前没有硬中断 `dispatchReplyFromConfig` 的 API
- 非文本消息会转文本：`file`/`data` 会转成 `[File: ...]`、`[Data: ...]`
- OpenClaw UI 对 `a2a` provider 的会话详情展示仍有限制
- 流式粒度依赖 OpenClaw：若仅返回 `final`，则会退化为单次 SSE 事件

## 路线图

详见 [M0-M4 详细执行计划](docs/m1-m4_execution_plan.md)。

| 里程碑 | 方向 |
|---|---|
| M0 | 底座 — `agentmeshd` daemon、EventV1、JSONL+SQLite |
| M1 | CLI — `agentmesh` 统一命令入口 |
| M2 | Web GUI — 拓扑、时间线、筛选 |
| M3 | Agent Teams — FSM 编排器 + 模板 |
| M4 | 半 WAN — Tailscale 接入 + 安全底座 |
