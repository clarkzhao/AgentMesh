# AgentMesh M0-M4 详细执行计划

> 版本：v0.2（2026-02-19）
> 当前代码库状态：已交付 M2（discovery-py SDK + openclaw-plugin 稳定）
> 本计划中 M0-M4 为下阶段规划编号，与 README 中历史里程碑编号无关。

## 0. 背景与原则

### 当前四个行动点
1. CLI 工具：降低安装、调用、排障成本。
2. Web GUI：可观测局域网内 Agent 交互。
3. Agent Teams：多 Agent 持续协作执行任务。
4. 半 WAN：可从远端终端接入内网 Agent Teams，并支持远程全权限执行。

### 方法论（唯物辩证法落地）
- 不以"功能清单"为主线，以"主要矛盾"作为阶段拆分依据。
- 每个阶段必须同时回答三件事：
  - 解决了什么核心矛盾
  - 如何验收（可量化）
  - 哪些边界先不做（防止范围失控）

## 1. 五个里程碑的主要矛盾与解法

### M0 底座
- 主要矛盾：后续所有里程碑都依赖事件基础设施和控制面 API，但这些尚不存在。
- 解法：先交付 `agentmeshd` daemon + EventV1 + 持久化层，为 CLI/GUI/Teams/WAN 铺路。

### M1 CLI
- 主要矛盾：能力已存在 vs 普通用户使用成本高。
- 解法：统一命令入口 + 框架适配层，屏蔽复杂配置。

### M2 Web GUI
- 主要矛盾：协作链路越来越复杂 vs 过程不可见不可追溯。
- 解法：统一事件流、时间线可视化、拓扑可视化。

### M3 Agent Teams
- 主要矛盾：任务是连续系统工程 vs 当前交互是离散单次调用。
- 解法：模板化团队编排（有限状态流程），把"点状能力"变成"组织能力"。

### M4 半 WAN + 远程全权限
- 主要矛盾：跨时空控制需求强 vs 信任边界与风险急剧上升。
- 解法：放开业务权限，但保留不可绕过的安全底座（身份、审计、熔断、短时凭证）。

## 2. 总体架构（M0-M4 共用底座）

### 2.1 控制面
- `agentmeshd`（本地常驻控制面服务，**Python** 实现）
- 新建 `packages/agentmeshd/` Python 包
- 提供统一 API：`discover/list/invoke/stream/cancel/trace/team/run`
- API surface：HTTP（Unix socket 可选）

### 2.2 数据面
- 框架适配器：`OpenClawAdapter`、`NanoClawAdapter`
- A2A 统一事件模型（EventV1）：
  - `status`
  - `message`
  - `artifact`
  - `tool`
  - `reasoning`
  - `error`

### 2.3 事件与存储
- Append-only JSONL（快速落地）
- SQLite 索引（查询与 GUI 筛选）
- Task/Run/Team 三级关联 ID：`task_id`、`run_id`、`team_run_id`

### 2.4 eventlog.py 迁移策略

现有 `packages/discovery-py/agentmesh_discovery/eventlog.py` 中 `EventRecord` 字段与 EventV1 的映射：

| EventRecord（旧） | EventV1（新） | 说明 |
|---|---|---|
| `ts` | `ts` | 保持不变 |
| `run_id` | `run_id` | 保持不变 |
| `event_type` | `kind` | 重命名，值域扩展为 status/message/artifact/tool/reasoning/error |
| `task_id` | `task_id` | 保持不变 |
| `step` | `step` | 保持不变 |
| `message` | `payload` | 重命名，类型从 `str | None` 扩展为 `dict[str, Any]` |
| `metadata` | `metadata` | 保持不变 |
| —（新增） | `team_run_id` | M3 新增，M0-M1 阶段为 null |
| —（新增） | `schema_version` | 值为 `"1"`，用于版本识别 |

迁移步骤：
1. M0 期间：`agentmeshd` 新写入一律使用 EventV1；读取时兼容旧格式（`event_type` → `kind`，`message` → `payload` 自动转换）
2. `discovery-py` 中保留 `eventlog.py` 的薄适配层（import 转发），标注 `@deprecated`
3. M1 发布时：移除 `discovery-py` 中的 `eventlog.py`，完成迁移
4. 字段映射详见本节表格，不另建迁移脚本（旧数据量极小）

### 2.5 安全底座（M4 必开）
- 设备身份（Machine Identity，Ed25519）
- 短时令牌（短 TTL）
- 全量审计日志（不可关闭）
- 一键熔断（只读降级）

### 2.6 CI/CD（交叉交付物）
- 最小 CI（GitHub Actions：lint + typecheck + test on push，覆盖 TS + Python）在 **M0** 交付
- E2E 烟测框架（填充空的 `tests/e2e/`）在 **M1** 补充
- CI 通过作为 **M1 起**每个里程碑验收的硬性前置条件（M0 自身用 CI 验证但不硬性阻塞）

## 3. M0 执行计划：底座冲刺

### 3.1 目标
为全部后续里程碑提供事件基础设施和 API 骨架。

### 3.2 交付物
- `packages/agentmeshd/`：Python 包，daemon 管理命令（start/stop/status）、HTTP API 骨架
- EventV1 schema 定义（status/message/artifact/tool/reasoning/error，含 `schema_version` 字段）
- JSONL writer（从 eventlog.py 迁移并补充测试，含旧格式只读兼容）
- SQLite schema + 索引器
- 最小 CI pipeline（GitHub Actions：lint + typecheck + test on push，覆盖 TS + Python）

### 3.3 验收标准
- daemon 管理命令正常（`agentmeshd start` / `agentmeshd stop` / `agentmeshd status`）
- 写入合成 EventV1 事件 → SQLite 查询返回一致
- EventV1 schema 有 `schema_version` 字段，读取旧格式 JSONL 可自动转换
- CI pipeline 在 push 时自动运行并通过

### 3.4 范围边界
- 仅含 daemon 管理命令（start/stop/status），不含用户业务 CLI（agentmesh run/trace/discover 等）
- 不含 GUI
- 不含 Auth

## 4. M1 执行计划：CLI 工具

### 4.1 目标
让用户在 10 分钟内完成：安装插件、发现 Agent、发起调用、查看轨迹。

### 4.2 命令设计（MVP）
- `agentmesh openclaw install`
- `agentmesh nanoclaw install`
- `agentmesh discover`
- `agentmesh run --from openclaw --to nanoclaw "1+1"`
- `agentmesh trace <task-id|run-id>`

### 4.3 技术拆解
1. CLI 框架：Python Typer（与 agentmeshd 同语言栈）
2. CLI 为 agentmeshd 客户端，依赖 M0
3. Adapter 接口
   - `install()`
   - `discover()`
   - `invoke()`
4. `agentmesh trace` 通过 agentmeshd HTTP API 查询 SQLite
5. 统一错误码与退出码
6. E2E 烟测框架（填充 `tests/e2e/`）

### 4.4 验收标准
- 首次使用路径成功率 >= 90%
- 核心命令平均响应 < 2s（不含推理时长）
- trace 对同一 task 可完整回放
- CI 通过（硬性前置）

### 4.5 范围边界
- 不做高级脚本 DSL
- 不做跨集群调度
- 移除 `discovery-py` 中的 `eventlog.py`，完成迁移

## 5. M2 执行计划：Web GUI（观测优先）

### 5.1 目标
让调试与运维人员看到 Agent 网络实时状态和任务全链路。

### 5.2 页面与能力
1. Topology：在线 Agent、技能、延迟、来源（mDNS/static/WAN）
2. Timeline：按 task/run 展示 status/tool/reasoning/message/artifact
3. Filter：按 agent、状态、时间窗口筛选

> Replay（从任意事件点回放上下文）推迟到 M3 之后按需实现——调试 Agent Teams 工作流时才真正需要。

### 5.3 技术拆解
- 后端：agentmeshd 扩展查询 API（基于 JSONL + SQLite）
- 前端：轻量 SPA（框架在 M2 kickoff 时决策，候选：React / Svelte / Vue）
- SSE/WebSocket：实时事件订阅

### 5.4 验收标准
- GUI 与 CLI trace 事件一致率 = 100%
- 同时观察 100 个活动 task 不明显卡顿
- 单 task 时间线可 1 秒内加载

### 5.5 范围边界
- 不做 Replay（推迟到 M3 后）
- 先不做"高危远程操作按钮"
- 先不做 RBAC 细粒度权限面板

## 6. M3 执行计划：Agent Teams（模板化编排）

### 6.1 目标
把多 Agent 协作从"人工串联"升级到"可复用模板化执行"。

### 6.2 Team 模型
- `team.yaml`（或 `team.json`）定义：
  - 角色/步骤
  - 路由目标
  - 终止条件
  - 重试策略
  - 人工介入点

### 6.3 FSM 状态表

Team Orchestrator 基于有限状态机，最小状态转换如下：

| State | Trigger | Next State |
|---|---|---|
| `pending` | `run()` | `running` |
| `running` | `step_complete` 且有后续步骤 | `running` |
| `running` | `step_complete` 且无后续步骤 | `completed` |
| `running` | `step_fail` 且 `retries_left > 0` | `retrying` |
| `retrying` | 重试执行 | `running` |
| `running` | `step_fail` 且 `retries_left = 0` | `failed` |
| `running` | `pause()` | `paused` |
| `paused` | `resume()` | `running` |
| `running` | `budget_exceeded` | `failed` |

FSM 实现在 `packages/agentmeshd/` 内（Python，与 daemon 同包）。状态持久化至 SQLite，支持中断后恢复。

### 6.4 首批模板

| 模板 | 步骤 | 说明 |
|---|---|---|
| `pipeline` | `analyze` → `execute` → `verify` → `summarize` | 通用四阶段流水线 |
| `incident-triage` | `detect` → `diagnose` → `mitigate` → `postmortem` | 故障排查 |
| `code-fix` | `analyze` → `modify` → `test` → `summarize` | 代码修复 |

每个步骤为 FSM 中的一个 `running` 子状态，步骤名称用于 trace 定位和完成率统计。

### 6.5 技术拆解
- Team Orchestrator（有限状态机 + SQLite 状态持久化）
- Step 级预算、超时、重试
- 可人工接管（pause/resume/approve）

### 6.6 验收标准
- 三个模板任务完成率 >= 80%（以步骤级成功/失败统计）
- 失败任务可定位根因（可追踪到步骤和事件）
- 支持中断后恢复执行

### 6.7 范围边界
- 不做开放式自治 DSL
- 不做无限自我迭代回路

## 7. M4 执行计划：半 WAN + 远程全权限

### 7.1 目标
远端终端（手机/眼镜/远程设备）可触发内网 Teams，并支持远程写操作/执行操作。

### 7.2 网络与接入
- 基于 Tailscale/Headscale 组网
- 控制面服务通过 tailnet 地址暴露
- 支持移动终端证书/设备身份绑定

### 7.3 权限策略（放开业务权限，但不放开安全底座）
- 允许远程执行与写操作
- 强制：
  - 短时凭证
  - 高危操作审计
  - 一键熔断
  - 可回滚轨迹

### 7.4 验收标准
- 远端终端可稳定触发 Team 任务并完成
- 高危操作 100% 有审计记录
- 熔断触发后系统在 10s 内进入只读降级

### 7.5 范围边界
- 不做公网匿名开放入口
- 不做无审计的"静默全权限"通道

## 8. 里程碑与时间表

| 阶段 | 内容 |
|---|---|
| Week 1-2 | **M0**: agentmeshd 骨架, EventV1 schema, JSONL+SQLite, 最小 CI |
| Week 3-4 | **M1**: CLI install/discover/run/trace, E2E 烟测 |
| Week 5-6 | **M2**: SPA 脚手架, Topology, Timeline, Filter, SSE |
| Week 7-9 | **M3**: Team Orchestrator FSM + 3 模板 + 人工介入 |
| Week 10-12 | **M4**: Tailscale 接入 + 远程全权限 + 安全底座 |

依赖链：M0 → M1 → M2 → M3 → M4（每个里程碑的启动依赖前一个里程碑的验收通过）。

## 9. KPI（每阶段必须可量化）

### 产品指标
- CLI 首次成功使用率 >= 90%
- Team 任务完成率 >= 80%
- 故障定位平均时长（MTTD）

### 工程指标

| 指标 | 阈值 | 数据来源 | 统计窗口 |
|---|---|---|---|
| 事件丢失率 | = 0% | agentmeshd JSONL vs SQLite 交叉校验 | 每次 push |
| 回放一致率（CLI trace vs GUI） | = 100% | M2 验收测试 | M2 验收时 |
| 任务超时率 | < 5% | agentmeshd 运行日志 | 滚动 7 天 |
| CI pipeline 通过率 | >= 95% | GitHub Actions run history | 滚动 30 天 |
| CI 平均耗时 | < 5 min | GitHub Actions timing | 滚动 7 天 |
| E2E 烟测通过率 | = 100%（M1 起） | `tests/e2e/` pytest 报告 | 每次 push |
| EventV1 写入-读回一致率 | = 100% | agentmeshd 单元测试 | 每次 push |

### 安全指标
- 审计覆盖率 = 100%（M4）
- 熔断触发成功率 = 100%（M4）
- 凭证过期拦截率 = 100%（M4）

## 10. 关键风险与应对

1. **agentmeshd daemon 设计风险**（M0，高）
   - 风险：进程管理、端口冲突、信号处理、跨平台兼容。
   - 应对：M0 第一周出原型，第二周压测。选用成熟 Python 进程管理库（如 `uvicorn` + `daemon` 模式）。

2. **范围膨胀**（M3 最容易）
   - 应对：模板优先，禁止先做通用自治平台。

3. **远程全权限风险过高**（M4）
   - 应对：权限可放开，但审计/熔断/短时凭证必须硬约束。

4. **跨框架适配碎片化**
   - 应对：Adapter 契约测试先行，新增框架必须过契约测试。

## 11. 交付物清单

1. `packages/agentmeshd/` daemon + EventV1 + 持久化层（M0）
2. 最小 CI pipeline — GitHub Actions（M0）
3. `agentmesh` CLI（M1）
4. E2E 烟测框架（M1）
5. Web GUI 观测台（M2）
6. Team Orchestrator + 3 模板（M3）
7. 半 WAN 接入方案与安全策略（M4）
8. 统一事件规范与运维手册

---

如果这版计划确认，下一步会拆成可执行任务板：
- 每项任务对应 owner、工时估算、依赖、验收用例、回滚方案。
