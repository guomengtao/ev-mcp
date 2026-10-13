# 对话操作 → MCP 插件 → Supabase 落库：端到端数据流

> 基线：`index.js` v0.2.0（436 行，2026-10-13 全 Supabase 线上版）
> 配套：[ev-mcp-实现流程详解.md](./ev-mcp-实现流程详解.md)（架构与分工），本文只聚焦**数据流**。

---

## 〇、总体数据流图

```
用户在 Trae CN 输入一句话
        │
        ▼
┌──────────────────────────────────────────────────┐
│  Trae CN IDE                                      │
│                                                   │
│  ① 读 ~/.trae-cn/mcp.json                        │
│  ② spawn: node /.../ev/ev-mcp/index.js           │
│  ③ stdin/stdout JSON-RPC 2.0 通信                │
│  ④ 每次 tools/call 之前/之后触发内置逻辑          │
└──────────────────┬───────────────────────────────┘
                   │  stdin/stdout (行分隔 JSON-RPC)
                   ▼
┌──────────────────────────────────────────────────┐
│  ev-mcp (index.js)                                │
│                                                   │
│  ┌─ 启动 ─────────────────────────────────────┐  │
│  │ initSession() → POST ev_mcp_sessions       │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ initialize ───────────────────────────────┐  │
│  │ clientName = params.clientInfo.name         │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ tools/call ───────────────────────────────┐  │
│  │ dbTool(name, args) → Supabase REST API     │  │
│  │   ├ ev_status     → GET  ev_mcp_tasks      │  │
│  │   ├ ev_add_task   → POST ev_mcp_tasks      │  │
│  │   ├ ev_start      → PATCH ev_mcp_tasks     │  │
│  │   ├ ev_done       → PATCH ev_mcp_tasks     │  │
│  │   ├ ev_harvest    → PATCH ev_mcp_tasks     │  │
│  │   ├ ev_log_message→ POST ev_mcp_logs       │  │
│  │   └ ev_name_session→ PATCH ev_mcp_sessions │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 自动落库（每次 tools/call 之后）──────────┐  │
│  │ callTool() → POST ev_mcp_logs               │  │
│  │   (assistant 角色，截断 ≤500 字)            │  │
│  └────────────────────────────────────────────┘  │
└──────────────────┬───────────────────────────────┘
                   │  HTTPS REST
                   ▼
┌──────────────────────────────────────────────────┐
│  Supabase (kqzkdpmyivtpxkfmibnd.supabase.co)     │
│                                                   │
│  ev_mcp_sessions   ← 会话记录（启动时写）         │
│  ev_mcp_tasks      ← 任务 CRUD                   │
│  ev_mcp_logs       ← 对话日志（每次操作自动写）   │
└──────────────────────────────────────────────────┘
```

---

## 一、启动阶段：会话落库

**触发时机**：Trae CN 首次调用 ev-mcp 的任何工具时，会先 spawn `node index.js`。

**代码位置**：[index.js L99-L110](file:///Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js#L99-L110)

```
node index.js 启动
  │
  ├─ 生成 sessionId = "S" + PID36 + "-" + TS36 + RND
  │   例：S189M-LDXO59 (PID=57370 → 37进制=189M)
  │
  ├─ 加载 .env → SB_URL / SB_KEY
  │
  └─ initSession()
       └─ dbCreateSession(sessionId, PROJECT, null)
            └─ POST /rest/v1/ev_mcp_sessions
                 Body: { id, project, name: null, pid, started_at }
```

**Supabase 写入**：

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_sessions` | `INSERT` | `id`, `project`, `name`(null), `pid`, `started_at` |

**实际数据示例**：
```json
{
  "id": "S189M-LDXO59",
  "project": "Banner",
  "name": null,
  "pid": 57370,
  "started_at": "2026-10-13T07:43:16.091+00:00"
}
```

> ⚠️ 此时 `name` 为 null——花名由后续 `ev_name_session` 工具补充。

---

## 二、逐工具数据流

### 2.1 `ev_name_session` —— 给会话起花名

```
用户说"开始干活"
  → AI 自己决定花名（如 🦁狮子）
    → tools/call: ev_name_session { name: "🦁狮子" }
      ├─ dbCheckNameUnique(PROJECT, "🦁狮子")
      │   └─ GET ev_mcp_sessions?project=eq.Banner&name=eq.🦁狮子
      │        → 查重，重复则拒绝
      │
      └─ dbRenameSession(sessionId, PROJECT, "🦁狮子")
           └─ PATCH ev_mcp_sessions?project=eq.Banner&id=eq.S189M-LDXO59
                Body: { name: "🦁狮子" }
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_sessions` | `SELECT` (查重) | `project`, `name` |
| `ev_mcp_sessions` | `UPDATE` | `name` |

**数据变化**：
```
之前: { name: null }
之后: { name: "🦁狮子" }
```

---

### 2.2 `ev_status` —— 读取任务状态（每轮对话开头必调）

```
用户说"继续"
  → AI 调用 tools/call: ev_status {}
    ├─ dbLoadTasks()
    │   └─ GET ev_mcp_tasks?project=eq.Banner&order=id.asc
    │
    └─ 格式化 SDR 表格返回给 AI
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `SELECT` | 全字段 |

**无写入**。但 `roundCount++`（对话轮次 +1，仅内存）。

**额外自动落库**（见第三节）：`callTool()` 在返回结果后自动写一条 `assistant` 日志到 `ev_mcp_logs`。

---

### 2.3 `ev_add_task` —— 登记新任务

```
用户说"帮我修复 ev-mcp 的 session_id 缺失问题"
  → AI 调用 tools/call: ev_add_task {
       title: "修复 ev_mcp_tasks 缺少 session_id 外键",
       description: "当前 ev_mcp_tasks 表没有 session_id 列，导致任务无法溯源到具体会话..."
     }
    ├─ genTaskId() → "evm-trae-banner-261013-1543-a1b2"
    │   格式: evm-{clientName}-{project}-{YYMMDD}-{HHmm}-{rand4}
    │
    └─ dbInsert(task)
         └─ POST /rest/v1/ev_mcp_tasks
              Body: {
                id, project, title, description,
                type: "feature", status: "open",
                source: "mcp", priority: "P2",
                created_at
              }
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `INSERT` | `id`, `project`, `title`, `description`, `type`, `status`, `source`, `priority`, `created_at` |

**生成的任务单号格式**：
```
evm-{客户端}-{项目}-{日期}-{时间}-{随机}
 例: evm-trae-banner-261013-1543-a1b2
     evm-trae-ev-mcp-261013-1315-2904
```

---

### 2.4 `ev_start` —— 领取任务（open → doing）

```
AI 说"我先领这个任务"
  → tools/call: ev_start { id: "evm-trae-banner-261013-1543-a1b2" }
    ├─ dbLoadTasks() → 找到该任务
    ├─ 校验 status === "open"（否则拒绝）
    │
    └─ dbUpdate(id, { status: "doing" })
         └─ PATCH ev_mcp_tasks?project=eq.Banner&id=eq.evm-trae-banner-261013-1543-a1b2
              Body: { status: "doing" }
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `SELECT` | 全字段（找任务 + 校验状态） |
| `ev_mcp_tasks` | `UPDATE` | `status` |

**数据变化**：
```
之前: { status: "open" }
之后: { status: "doing" }
```

---

### 2.5 `ev_done` —— 完成任务（doing → done）

```
AI 干完活了
  → tools/call: ev_done { id: "evm-trae-banner-261013-1543-a1b2" }
    ├─ dbLoadTasks() → 找到该任务
    │
    └─ dbUpdate(id, { status: "done" })
         └─ PATCH ev_mcp_tasks?project=eq.Banner&id=eq....
              Body: { status: "done" }
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `SELECT` | 全字段（找任务） |
| `ev_mcp_tasks` | `UPDATE` | `status` |

**数据变化**：
```
之前: { status: "doing" }
之后: { status: "done" }
```

---

### 2.6 `ev_harvest` —— 收割已完成任务（done → harvested）

```
AI 说"收割一下"
  → tools/call: ev_harvest {}
    ├─ dbLoadTasks() → 筛选 status === "done" 的任务
    │
    └─ 对每个 done 任务:
         └─ dbUpdate(id, { status: "harvested" })
              └─ PATCH ev_mcp_tasks?...
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `SELECT` | 全字段（筛选 done） |
| `ev_mcp_tasks` | `UPDATE` × N | `status`（每条 done → harvested） |

**数据变化**：
```
之前: [
  { id: "xxx-1", status: "done" },
  { id: "xxx-2", status: "done" },
]
之后: [
  { id: "xxx-1", status: "harvested" },
  { id: "xxx-2", status: "harvested" },
]
```

---

### 2.7 `ev_log_message` —— 手动记录对话日志

```
AI 想手动记一条日志
  → tools/call: ev_log_message {
       role: "user",
       content: "请帮我查一下 ev_mcp_sessions 表里有多少条记录",
       task_id: "evm-trae-banner-261013-1543-a1b2"
     }
    ├─ 校验 role 非空、content 非空
    ├─ 如果存在进行中(doing)任务 → 强制要求 task_id
    │   否则拒绝（门禁）
    │
    └─ dbLogMessage(role, content, sessionId, taskId, toolName, ...)
         └─ POST /rest/v1/ev_mcp_logs
              Body: {
                project, role, content,
                session_id, task_id, tool_name,
                duration_ms, request_id, status,
                client_name, created_at
              }
```

| 表 | 操作 | 字段 |
|---|---|---|
| `ev_mcp_tasks` | `SELECT` | 查进行中任务（门禁校验） |
| `ev_mcp_logs` | `INSERT` | `project`, `role`, `content`, `session_id`, `task_id`, `tool_name`, `duration_ms`, `request_id`, `status`, `client_name`, `created_at` |

**门禁逻辑**：
```
有进行中任务 + 没传 task_id → ❌ 拒绝
有进行中任务 + task_id 不匹配 → ❌ 拒绝
有进行中任务 + task_id 匹配 → ✅ 允许
无进行中任务 → ✅ 允许（task_id 可选）
```

---

## 三、自动落库：`callTool` 的副作用

**这是最关键的隐式行为**——每次 `tools/call` 执行完毕后，`callTool()` 会**自动**写一条 `assistant` 日志。

**代码位置**：[index.js L338-L372](file:///Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js#L338-L372)

```
callTool(name, args, reqId)
  │
  ├─ 执行 dbTool(name, args) → 得到结果文本
  │
  └─ if (name !== "ev_log_message" && useDb && result)
       │  （跳过 ev_log_message 避免重复落库）
       │
       ├─ 截断结果 ≤ 500 字
       ├─ 查找当前进行中的任务（取第一个 doing）
       │
       └─ dbLogMessage("assistant", text, sessionId, taskId, toolName, durationMs, reqId, "ok", clientName)
            └─ POST /rest/v1/ev_mcp_logs
```

| 表 | 操作 | 触发条件 |
|---|---|---|
| `ev_mcp_logs` | `INSERT` | 每次 `tools/call` 执行后（除 `ev_log_message` 自身） |

**这意味着**：

| 你调用的工具 | 自动写入 ev_mcp_logs 的内容 |
|---|---|
| `ev_status` | SDR 表格文本（截断 ≤500 字） |
| `ev_add_task` | "已登记 evm-xxx-xxx：标题" |
| `ev_start` | "evm-xxx 已开始（进行中）" |
| `ev_done` | "evm-xxx 已完成" |
| `ev_harvest` | "收割 N 条：\n- xxx\n- yyy" |
| `ev_name_session` | "🌸 会话花名已定为：🦁狮子" |
| `ev_log_message` | **不自动写**（dbTool 里已手工写） |

---

## 四、完整示例：一次对话的数据库写入序列

假设用户打开 Trae CN，说了一句"帮我统计 ev_mcp_sessions 的记录数"。

```
时间线                         Supabase 操作
──────                         ─────────────

① ev-mcp 进程启动
                               POST ev_mcp_sessions
                               { id: "S189M-LDXO59", name: null, ... }

② Trae 发送 initialize
   → clientName = "Trae"

③ AI 决定花名：🦁狮子
   → tools/call: ev_name_session
                               GET  ev_mcp_sessions (查重)
                               PATCH ev_mcp_sessions
                               { name: "🦁狮子" }
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "🌸 会话花名已定为：🦁狮子",
                                 session_id: "S189M-LDXO59", ... }

④ 用户说"帮我统计 ev_mcp_sessions 的记录数"
   → AI 调用 tools/call: ev_status
                               GET ev_mcp_tasks
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "📋 SDR...",
                                 session_id: "S189M-LDXO59", ... }

⑤ AI 登记任务
   → tools/call: ev_add_task
                               POST ev_mcp_tasks
                               { id: "evm-trae-banner-...", title: "统计...", ... }
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "已登记 evm-trae-...",
                                 task_id: "evm-trae-banner-...", ... }

⑥ AI 领取任务
   → tools/call: ev_start
                               GET  ev_mcp_tasks (校验 status=open)
                               PATCH ev_mcp_tasks { status: "doing" }
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "evm-trae-... 已开始",
                                 task_id: "evm-trae-banner-...", ... }

⑦ AI 干活... (查数据库、写代码等)

⑧ AI 完成任务
   → tools/call: ev_done
                               PATCH ev_mcp_tasks { status: "done" }
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "evm-trae-... 已完成",
                                 task_id: "evm-trae-banner-...", ... }

⑨ AI 收割
   → tools/call: ev_harvest
                               GET  ev_mcp_tasks (筛选 done)
                               PATCH ev_mcp_tasks { status: "harvested" }
                               ↓
                               POST ev_mcp_logs (auto)
                               { role: "assistant", content: "收割 1 条：...",
                                 task_id: "evm-trae-banner-...", ... }
```

**这一轮对话最终在 Supabase 留下**：
- `ev_mcp_sessions`：1 条（启动时写入，花名后更新）
- `ev_mcp_tasks`：1 条（open → doing → done → harvested）
- `ev_mcp_logs`：6 条（每次 tool call 自动写，ev_name_status 1 + ev_status 1 + ev_add_task 1 + ev_start 1 + ev_done 1 + ev_harvest 1）

---

## 五、三张 Supabase 表结构

### `ev_mcp_sessions`

| 列 | 类型 | 说明 | 写入时机 |
|---|---|---|---|
| `id` | text (PK) | 会话唯一ID，如 `S189M-LDXO59` | 启动时 |
| `project` | text | 项目名（默认 cwd basename） | 启动时 |
| `name` | text | 花名，如 `🦁狮子` | `ev_name_session` 时更新 |
| `pid` | int | Node 进程 PID | 启动时 |
| `started_at` | timestamptz | 启动时间 | 启动时 |

### `ev_mcp_tasks`

| 列 | 类型 | 说明 | 写入时机 |
|---|---|---|---|
| `id` | text (PK) | 任务单号，如 `evm-trae-banner-261013-1543-a1b2` | `ev_add_task` |
| `project` | text | 所属项目 | `ev_add_task` |
| `title` | text | 任务标题 | `ev_add_task` |
| `description` | text | 任务描述（≥50字） | `ev_add_task` |
| `type` | text | 固定 `feature` | `ev_add_task` |
| `status` | text | open/doing/done/harvested/blocked | `ev_add_task` → `ev_start` → `ev_done` → `ev_harvest` |
| `source` | text | 固定 `mcp` | `ev_add_task` |
| `priority` | text | 固定 `P2` | `ev_add_task` |
| `created_at` | timestamptz | 创建时间 | `ev_add_task` |

> ⚠️ **当前缺失**：没有 `session_id` 外键列——任务无法溯源到具体会话。  
> 这意味着如果你在 Trae CN 和 CodeBuddy 各领一个任务，Supabase 里看不出谁领的。

### `ev_mcp_logs`

| 列 | 类型 | 说明 | 写入时机 |
|---|---|---|---|
| `project` | text | 所属项目 | 每次 tool call / ev_log_message |
| `role` | text | user / assistant / system | 每次 tool call / ev_log_message |
| `content` | text | 消息内容（自动落库截断 ≤500字） | 每次 tool call / ev_log_message |
| `session_id` | text | 关联会话ID | 每次 tool call / ev_log_message |
| `task_id` | text | 关联任务单号 | 进行中任务时自动关联 |
| `tool_name` | text | 产生日志的工具名 | 每次 tool call / ev_log_message |
| `duration_ms` | int | 工具调用耗时(ms) | 每次 tool call |
| `request_id` | text | MCP 请求ID | 每次 tool call |
| `status` | text | ok / error | 每次 tool call |
| `client_name` | text | 客户端名，如 `Trae` | 每次 tool call |
| `created_at` | timestamptz | 创建时间 | 每次 tool call / ev_log_message |

---

## 六、当前已知问题

| 问题 | 影响 | 建议 |
|---|---|---|
| `ev_mcp_tasks` 无 `session_id` 列 | 任务无法溯源到具体会话 | 加列 + 改 `dbInsert` |
| `ev_log_message` 和自动落库可能重复 | 同一轮对话两条 assistant 日志 | 当前已跳过（`name !== "ev_log_message"`），但需留意 |
| 自动落库只取第一个 doing 任务 | 多任务并行时可能关联错任务 | 加 `task_id` 参数到其他工具 |
| 启动时 `name` 为 null | 如果 AI 忘记 `ev_name_session`，花名永远为 null | 考虑默认花名或延迟写入 |