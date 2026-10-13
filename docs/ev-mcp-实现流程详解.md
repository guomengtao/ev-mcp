# ev-mcp 实现流程详解

> 版本基线：`package.json` v0.2.0 · `index.js` 436 行（2026-10-13 全线上版）
> 目的：把「这个项目到底怎么跑的」一次讲清楚——两部分分工、七个工具、运行流程，
> 以及四条核心链路：**对话入库、任务领取、任务关闭、花名管理**。
> 本文只描述**已实现的事实**，与 `index.js` 逐行对应。

---

## 一、项目是什么

ev-mcp 是一个**独立的 MCP (Model Context Protocol) Server**，通过 `stdio + 行分隔 JSON-RPC 2.0` 与 AI IDE（Trae / Claude Code / Cursor 等）通信。

它解决的问题只有一个：**让 AI 具备"任务记账"能力**——领单、干活、关单、收割，外加把每一轮对话落库留痕。所有状态存在 Supabase，跨会话、跨 AI、跨机器同步。

它不是某个业务项目的子模块，定位类似 `eslint`：**自己是一个仓，被装进各个项目里用**。

---

## 二、两部分分工（核心）

整个 MCP 插件由两部分组成，**一个提供能力，一个提供纪律，缺一不可**：

```
┌────────────────────────────────────────────────────────────┐
│                       IDE（Trae / Claude / Cursor）          │
│                                                            │
│   ① 纪律层                          ② 能力层                │
│   rules/*.md                        ev-mcp Server           │
│   （项目规则 / 会话纪律 skill）        （index.js）             │
│        │                                 │                  │
│        │ 告诉 AI「何时该调什么」           │ 告诉 AI「能调什么」    │
│        └──────────► AI ◄─────────────────┘                  │
│                      │                                      │
│                      └─ tools/call ─► Supabase PostgREST     │
└────────────────────────────────────────────────────────────┘
```

| | ① 纪律层 | ② 能力层 |
|---|---|---|
| **载体** | `rules/project_rules.md`、`rules/session-discipline-skill.md` | `index.js`（MCP Server 本体） |
| **形态** | 纯 Markdown 行为协议 | Node 进程，长驻，stdio 通信 |
| **回答的问题** | **何时**调、**必须**调、调完**必须**做什么 | **能**调什么、每次调用**怎么落库** |
| **生效方式** | 被读进 AI 上下文，靠自觉遵守 | 被 IDE 通过 `.trae/mcp.json` 拉起，协议强制 |
| **能否被绕过** | 能（AI 可以不遵守） | 不能（工具返回什么就是什么） |
| **类比** | 操作手册 | 机器本身 |

> **设计哲学**：MCP 协议本质是"工具提供"，**不是 Hook 拦截**。所以纪律层是软约束——
> 这也是为什么 Claude/CodeBuddy 侧还要额外挂真 Hook（见 §八 双轨分工），而 Trae 侧只能靠规则自约束。

补充一个**连接层**（常被算作"第三件套"）：`.trae/mcp.json` 告诉 IDE「有个 Server 在 `node index.js`，去连它」：

```json
{ "mcpServers": { "evops": {
    "command": "node",
    "args": ["/Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js"] } } }
```

---

## 三、数据层：Supabase 三张表

**纯线上，无本地降级**（2026-10-13 用户裁定）：Supabase 不通 = 服务不可用，不降级。连接凭据从 `.env` 读（加载顺序：`<仓库>/.env` → `<cwd>/.ev-mcp/.env`），键名支持 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（兼容 `NEXT_PUBLIC_Ev_*` / `Ev_*` 前缀）。

| 表 | 主键 | 关键字段 | 作用 |
|---|---|---|---|
| `ev_mcp_sessions` | `id`（如 `S2AB-3FQ7X`） | `project`、`name`（花名）、`pid`、`started_at`；**UNIQUE(project, name)** | 每次 MCP 进程启动写一行，花名落这里 |
| `ev_mcp_logs` | `id` BIGSERIAL | `project`、`role`、`content`、`session_id`、`task_id`、`tool_name`、`duration_ms`、`request_id`、`status`、`client_name`、`created_at` | 每轮对话 + 每次工具调用的留痕 |
| `ev_mcp_tasks` | `id`（如 `evm-trae-ev-mcp-261013-2130-a7f3`） | `project`、`title`、`description`、`type`、`status`、`source`、`priority`、`created_at` | 任务本体 |

**任务状态机**：

```
open ──ev_start──► doing ──ev_done──► done ──ev_harvest──► harvested
                                                                  （终态）
        （blocked 字段预留，代码中未开工具入口）
```

> ⚠️ 与旧文档的差异：`EvoPS-MCP经验总结.md` 里写的 `evops_tasks` / `conversation_logs` 是 **0.1 版**表名，现已全部改前缀为 `ev_mcp_*`，与云端老表**零共用**，属"深度切割"。

---

## 四、七个工具（能力清单）

| 工具 | 参数 | 干什么 | 落库动作 |
|---|---|---|---|
| `ev_status` | — | **每轮对话开始必调**；`roundCount++`，返回 SDR 表格 + 任务清单 | 读 `ev_mcp_tasks`（不写） |
| `ev_add_task` | `title`、`description`(≥50字) | 登记新任务，返回新单号 | INSERT `ev_mcp_tasks`，`status=open` |
| `ev_start` | `id` | 领取任务，`open → doing`；非 open 直接拒绝 | PATCH `status=doing` |
| `ev_done` | `id` | 关单，`→ done` | PATCH `status=done` |
| `ev_harvest` | — | 收割全部 done → harvested，输出清单 | 逐条 PATCH `status=harvested` |
| `ev_log_message` | `role`、`content`、`session_id?`、`task_id?`、`tool_name?` | 把一轮对话正文写进日志表 | INSERT `ev_mcp_logs` |
| `ev_name_session` | `name` | **给当前会话起花名**（AI 自己起，不许问用户） | 查重 + PATCH `ev_mcp_sessions.name` |

**单号生成规则**（`genTaskId()`）：

```
evm-{tool}-{project}-{YYMMDD}-{HHMM}-{random4}
     ↑        ↑
 clientName  EV_PROJECT（缺省取目录名）
 如：evm-trae-ev-mcp-261013-2130-a7f3
```

**会话 ID 生成规则**（进程级，启动即定）：

```
sessionId = "S" + PID.toString(36) + "-" + (Date.now()%0xFFFF).toString(36) + random3
             如 S2AB-3FQ7X —— PID + 毫秒时间戳 + 随机码，防多进程撞车
```

---

## 五、项目运行流程（端到端）

```
① IDE 启动 / 打开项目
      │  读取 .trae/mcp.json
      ▼
② IDE 拉起 node index.js（stdio 管道建立）
      │
      ├─ 加载 .env（两级路径兜底）
      ├─ 生成 sessionId（PID+TS+随机）
      ├─ POST ev_mcp_sessions 立案（name=null，花名待起）
      └─ init 探测：GET ev_mcp_tasks?limit=0  → 成功则 useDb=true
      │
③ IDE 发 initialize → 回 serverInfo{name:"ev-mcp", version:"0.2.0"} + 上报 clientInfo
      │                                    ↳ clientName 决定单号里的 tool 段
      ▼
④ 会话欢迎流（纪律层要求，4 步）：
      花名 → 会话立案 → 今日战报(ev_status) → 就绪声明
      │
      ▼
⑤ 每轮用户消息循环：
      ev_status（生成 SDR 表格，附在回复末尾）
      ev_log_message（role=user，正文入库）
      干活（可能穿插 ev_add_task / ev_start / ev_done）
      每次 tools/call 完成后自动补一条 assistant 日志（见 §六）
      │
      ▼
⑥ 进程退出 = 会话自然关闭（无显式 close 工具）
```

**协议支持的方法**：`initialize` / `tools/list` / `tools/call` / `ping` / `resources/list`（空）/ `prompts/list`（空）；未知方法回 `-32601 method not found`。**零 npm 依赖**——`fetch` 直连 PostgREST，`node_modules` 只是历史残留。

---

## 六、链路 A：一条对话「发布 → 入库 → 返回」

用户发一句话，到数据落进 Supabase 并返回 AI 回复，中间发生这些事：

```
用户输入 "给 evmcp 补充文档"
   │
   ▼
IDE 把消息交给 AI（含全部上下文）
   │
   ├─(1) AI 调 ev_log_message{role:"user", content:"给 evmcp 补充文档"}
   │        │
   │        ▼  ev-mcp 服务端校验（三层）
   │      ① role 非空？ content 非空？        ── 否 → 返回 "❌ 字段必填"，不落库
   │      ② 查 ev_mcp_tasks 有无 doing 任务？  ── 有 → 必须传 task_id
   │      ③ 传的 task_id 真是 doing 里的？     ── 否 → 返回 "❌ 不是进行中任务"，不落库
   │        │
   │        ▼  全部通过
   │      POST /rest/v1/ev_mcp_logs
   │      {project, role:"user", content, session_id, task_id, tool_name, client_name, created_at}
   │        │
   │        └─► 返回 "已记录 [user]: 给 evmcp 补充文档"
   │
   ├─(2) AI 调 ev_status → roundCount++ → 读 ev_mcp_tasks → 拼 SDR 表格返回
   │
   ├─(3) AI 干活：调 ev_add_task / ev_start / 改文件 / ev_done …
   │        │
   │        └─ 每次 tools/call 结束，callTool() 自动落库一条 assistant 日志：
   │           {role:"assistant", content: 工具返回文本.slice(0,500),
   │            task_id: 当前 doing 任务, tool_name, duration_ms, request_id, client_name}
   │           ⚠️ ev_log_message 自己已记过，跳过，避免重复
   │
   └─(4) AI 输出回复，末尾附 SDR 表格  ──►  用户看到结果
```

**要点**
- 每条日志都带 `project` 隔离，跨项目不会串味。
- 日志记录**是软约束**：`ev_log_message` 是 AI 主动调用的；服务端只能校验"调了之后参数对不对"，不能强制"必须调"。
- `duration_ms` 由 MCP 内部真实计时（非 token 计费），可用来做性能统计。
- `client_name` 来自 `initialize` 上报，用于区分 Trae / Claude 等来源。

---

## 七、链路 B / C：任务领取 与 任务关闭

### B. 领取流程

```
用户下达任务
   │
   ▼
① ev_add_task{title, description(≥50字)}
   │    ├─ genTaskId() 生成 evm-{tool}-{proj}-{YYMMDD}-{HHMM}-{random4}
   │    ├─ INSERT ev_mcp_tasks（status=open, source=mcp, priority=P2）
   │    └─ 返回 "已登记 evm-trae-ev-mcp-261013-2130-a7f3：<标题>"
   │
   ▼
② ev_start{id}
   │    ├─ 查不到该单号      → "未找到单号 xxx"
   │    ├─ status ≠ open     → "只有 open 任务可开始，当前是 doing/done/…"
   │    └─ status = open     → PATCH status=doing → "xxx 已开始（进行中）"
   │
   ▼
③ 进入 doing 期间：任何 ev_log_message 都必须带这个 task_id（否则被拒）
```

**为什么强制 task_id**：保证"对话日志"能挂到具体任务上，事后可追溯「这轮改了啥、属于哪张单」。同时天然限制**同一会话同一时刻只有一条 doing**（纪律层再加一句"一个 in_progress 任务/一个单号"）。

### C. 关闭流程

```
① ev_done{id}     → PATCH status=done    → "xxx 已完成"
                       （此时是"待收割"状态，还没进终态）
② ev_harvest()    → 扫全部 status=done → 逐条 PATCH status=harvested
                  → "收割 N 条：- id 标题 …"
                  （无 done 任务时返回 "无待收割任务"）
```

**done vs harvested 的区别**：`done` = 活干完了等确认；`harvested` = 已入账归档（终态）。SDR 表格里 `完成` 计数 = `done + harvested`，`待收割` = `done`——所以"完成数"不会因为收割而跳变。

### 双轨对照（同一件事的两种做法）

| 环节 | Trae 侧（ev-mcp） | Claude/CodeBuddy 侧（老 evtask） |
|---|---|---|
| 领单 | `ev_add_task`（MCP 工具） | `POST app-auth.gudq.com/api/ev?action=task-register` |
| 单号 | `evm-trae-ev-mcp-261013-2130-a7f3` | `evtask-D-evev-mcp-261013-7ajwfq` |
| 文件认领 | 无（Trae 无 hook，靠规则自觉 + 自跑 `claim_guard.py` 模拟） | `ev-claim.sh claim --files … --repo …`（Hook 强制） |
| 关单 | `ev_done` → `ev_harvest` | `POST ?action=task-close`（带 evidence）+ `ev-claim.sh release` |
| 门禁 | 无原生 Hook，规则自约束 | `~/.claude/hooks/ev-claim-guard.sh` PreToolUse 硬拦 |

> 2026-10-13 用户定：**两套并存、互不干扰**。Trae 优先用 ev-mcp（`evm-*`），老 `evtask-*` 云系统供 Claude/CodeBuddy 继续使用。

---

## 八、链路 D：花名管理流程

花名是"会话的身份证"，会出现在 SDR 表格、EvOps Dashboard、任务详情里。

```
进程启动 ──► sessionName = null（花名未定）
                │
                ▼
        ┌───────────────────────────────┐
        │  花名门禁（服务端硬拦）           │
        │  UNGUARDED = [                │
        │    "ev_name_session",         │
        │    "ev_status" ]              │
        │  未起名时，除这两个之外的所有工具   │
        │  一律返回：                     │
        │  "🚫 尚未设置花名！必须自己起名，  │
        │   不要问我——请立即调用           │
        │   ev_name_session 自己起一个…"   │
        └───────────────────────────────┘
                │
                ▼  AI 自己起名（≤8汉字 + 1 emoji，如 🔨小铁锤、🐘象往）
        ev_name_session{name}
                │
                ├─(1) 查重：GET ev_mcp_sessions?project=eq.X&name=eq.Y
                │        └─ 已存在 → "❌ 花名已被本项目其他会话使用，请换一个"（不落库）
                ├─(2) PATCH ev_mcp_sessions 的 name 字段
                └─(3) 内存 sessionName = name  ──► 门禁解除，全部工具可用
                     └─► 返回 "🌸 会话花名已定为：🔨小铁锤"
```

**设计要点**
1. **门禁在服务端**，不在规则里——即使 AI 忘记，调 `ev_add_task` 也会被挡回来并收到明确指令，形成"自纠错回路"。
2. `ev_status` 故意放行：没花名也能看 SDR、看任务，不阻塞用户查看状态。
3. **查重靠数据库 UNIQUE(project, name) + 前置 SELECT**：同一项目内花名唯一，跨项目可重名。
4. **花名由 AI 自己定，禁止反问用户**——这条被写进工具 description 和返回文案（"不要问我"），是用户 2026-10-11 的明确裁定。
5. **门禁只在内存期有效**：重启进程 = 花名重来（DB 里旧会话记录仍在，但新会话要重新起名）。

---

## 九、版本演进：0.1 → 0.2（为什么文档会有"两套说法"）

| 维度 | 0.1 版（经验总结里描述的） | 0.2 版（当前 index.js） |
|---|---|---|
| 存储 | Supabase 优先 + **本地 `state.json` 兜底** | **纯 Supabase**，不降级 |
| 表名 | `evops_tasks` / `conversation_logs` | `ev_mcp_tasks` / `ev_mcp_logs` / `ev_mcp_sessions` |
| 单号 | `EV-0001` 自增 | `evm-{tool}-{proj}-{YYMMDD}-{HHMM}-{rand4}` |
| 工具数 | 5 个 | 7 个（+ `ev_start`、`ev_name_session`） |
| 会话 | 无会话概念 | 有 `sessionId` + 花名 + 会话表 |
| 日志字段 | project/session_id/role/content | 增加 `task_id` `tool_name` `duration_ms` `request_id` `status` `client_name` |

**为什么砍掉本地兜底**：本地与远端做一致性同步的复杂度 > 收益；且"降级"会让数据分叉，反而破坏"唯一真源"。

---

## 十、边界与已知软肋

| 项 | 说明 |
|---|---|
| **依赖 Supabase** | 连不上就是不可用（设计如此）。代码里有 `useDb` 开关，但 0.2 版没有本地模式实现，探测失败时工具会直接抛错 |
| **日志是软约束** | AI 不调 `ev_log_message` 就没有 user 日志；MCP 无法拦截 |
| **Trae 无 Hook** | 文件认领门禁在 Trae 侧靠"自跑 `claim_guard.py`"模拟，不跑就没人拦 |
| **花名不落内存外** | 进程重启需重新起名（DB 里旧记录不自动继承） |
| **package.json 仍列 `@supabase/supabase-js`** | 实际代码零依赖，这行是历史残留，可清理 |

---

## 附：文件地图

```
ev-mcp/
├── index.js                       ← ② 能力层：MCP Server 本体（436 行）
├── package.json / package-lock.json
├── .env                           ← 凭据（不入库）
├── supabase/schema.sql            ← 三张表建表 SQL
├── .trae/mcp.json                 ← 连接层：IDE 怎么拉起 Server
├── rules/
│   ├── project_rules.md           ← ① 纪律层：项目规则（含 Gate 0 领单）
│   └── session-discipline-skill.md← ① 纪律层：会话纪律 skill（382 行）
├── EvoPS-MCP经验总结.md            ← 0.1 版开发踩坑记录（历史）
└── docs/
    └── ev-mcp-实现流程详解.md       ← 本文
```
