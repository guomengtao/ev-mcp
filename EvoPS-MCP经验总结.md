# ev-mcp — AI 对话任务管理 & 持久化

> 为 Trae IDE / Claude / Cursor 等 MCP 兼容客户端打造的对话级任务管理系统  
> **零依赖** · Supabase 远端真源 · 自动降级 · 对话日志留痕

---

## 1. 项目定位

ev-mcp 是一个独立的 **MCP (Model Context Protocol) Server**，通过 stdio JSON-RPC 与 AI IDE 交互。它不是某个项目的"子模块"，而是一个**独立可复用的基础设施组件**。

核心价值：**让 AI 具备任务记账能力** —— 领单、干活、标记完成、收割产出，所有状态持久化到 Supabase，跨会话同步。

### 适用场景

- 个人开发者用 AI IDE 干活，需要追踪任务进度
- 多 AI 协作开发，需要共享任务状态
- 团队希望 AI 的每一轮对话都留痕可查
- Trae IDE · Claude Code · Cursor 等支持 MCP 的客户端

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────┐
│                  Trae IDE (客户端)                  │
│  ┌──────────────┐     stdio JSON-RPC              │
│  │ ev.md (规则)  │──── 驱动 AI ────┐               │
│  └──────────────┘                 ▼               │
│                         ┌─────────────────┐       │
│                         │   ev-mcp         │       │
│                         │   (MCP Server)   │       │
│                         │                 │       │
│                         │  5 个工具：       │       │
│                         │  ev_status      │       │
│                         │  ev_add_task    │       │
│                         │  ev_done        │       │
│                         │  ev_harvest     │       │
│                         │  ev_log_message │       │
│                         └───────┬─────────┘       │
│                                 │                  │
│                    优先 ▼        │ 兜底 ▼           │
│               ┌──────────┐  ┌──────────┐          │
│               │ Supabase │  │ 本地      │          │
│               │ REST API │  │ state.json│          │
│               └──────────┘  └──────────┘          │
└──────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| **零 npm 依赖** | Node 18+ 原生 `fetch` 直连 Supabase PostgREST，无需安装任何包 |
| **自动降级** | Supabase 不可达时无缝切回本地 `state.json`，服务不中断 |
| **stdin/stdout JSON-RPC** | 标准 MCP 传输协议，与 IDE 进程无关 |
| **环境变量配置** | `.env` 文件加载，不硬编码凭据 |
| **项目隔离** | 通过 `EV_PROJECT` 环境变量区分不同项目的任务 |

---

## 3. 三组件协作模型

ev-mcp 的对话日志功能需要**三个组件配合**才能工作，缺一不可：

```
用户输入 → IDE 接收
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 mcp.json    ev.md      ev-mcp Server
 (连接配置)   (行为规则)   (执行引擎)
    │           │           │
    │  告诉IDE  │  告诉AI   │  提供工具
    │  "连谁"   │  "何时调"  │  "怎么存"
    │           │           │
    └───────────┼───────────┘
                ▼
           Supabase
```

| 组件 | 角色 | 干什么 | 类比 |
|------|------|--------|------|
| **mcp.json** | 连接器 | 告诉 IDE "有个 MCP Server 在 `node index.js`，去连它" | 电线插头 |
| **ev.md** | 行为协议 | 告诉 AI "收到用户消息后必须调 `ev_log_message`" | 操作手册 |
| **ev-mcp/index.js** | 执行引擎 | 收到调用后实际写数据库 | 机器本身 |

> **MCP Server 提供"能力"，规则文件提供"纪律"。**  
> 有能力没纪律 = 工具闲置；有纪律没能力 = 无米之炊。

> ⚠️ 注意：`ev_log_message` 是**软约束**而非硬约束。MCP 协议本质是"工具提供"不是"Hook 拦截"——AI 可以主动选择不调用。追求 100% 可靠记录需要 IDE 层中间件配合。

---

## 4. 数据库设计 (Supabase)

### 4.1 evops_tasks — 任务表

```sql
CREATE TABLE evops_tasks (
  id          TEXT PRIMARY KEY,      -- EV-0001, EV-0002 ...
  project     TEXT NOT NULL,         -- 所属项目
  title       TEXT NOT NULL,         -- 任务标题
  description TEXT,                  -- 任务描述 (≥50字)
  type        TEXT DEFAULT 'feature',-- feature / bugfix / refactor
  status      TEXT DEFAULT 'open',   -- open → doing → done → harvested
  source      TEXT DEFAULT 'mcp',    -- 来源标识
  priority    TEXT DEFAULT 'P2',     -- P0/P1/P2/P3
  replies     JSONB,                 -- 扩展：AI 回复记录
  extra       JSONB,                 -- 扩展：额外元数据
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX idx_tasks_project ON evops_tasks(project);
CREATE INDEX idx_tasks_status  ON evops_tasks(status);
```

### 4.2 conversation_logs — 对话日志表

```sql
CREATE TABLE conversation_logs (
  id          BIGSERIAL PRIMARY KEY,
  project     TEXT NOT NULL,
  session_id  TEXT,
  role        TEXT NOT NULL,         -- user / assistant / system
  content     TEXT NOT NULL,         -- 消息内容
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_project ON conversation_logs(project);
CREATE INDEX idx_logs_session ON conversation_logs(session_id);
CREATE INDEX idx_logs_created ON conversation_logs(created_at DESC);
```

---

## 5. 代码结构

```
ev-mcp/                       ← ⭐ GitHub 仓库根目录
├── README.md                 ← 项目说明（即本文档）
├── index.js                  ← MCP Server 主入口 (~330 行)
├── package.json              ← 元信息 (name: ev-mcp, version: 0.2.0)
├── .gitignore                ← 忽略 node_modules, .env, .ev/
├── .env.example              ← 环境变量模板（不含真实凭据）
│
├── supabase/
│   └── schema.sql            ← 建表 SQL（evops_tasks + conversation_logs）
│
├── docs/
│   ├── ev.md                 ← AI 行为规则（用户复制到 IDE 的 .trae/rules/ 下）
│   └── mcp.json              ← MCP 配置模板（用户复制到 IDE 的 .trae/ 下）
│
└── skills/                   ← 可选：附带技能定义
    └── SKILL.md              ← morning-cut 收割技能
```

### 文件职责

#### index.js — MCP Server 核心

| 模块 | 行数 | 职责 |
|------|------|------|
| 配置 & `.env` 加载 | 1-50 | 读取环境变量，解析 Supabase 凭据 |
| Supabase REST 客户端 `sb()` | 52-70 | 零依赖 fetch 封装，支持 GET/POST/PATCH |
| 本地兜底 `loadLocal/saveLocal` | 72-80 | 读写 `.ev/state.json` |
| 工具定义 `TOOLS[]` | 82-128 | 5 个 MCP 工具的 JSON Schema |
| 本地模式 `localTool()` | 150-195 | 纯文件存储的任务/日志操作 |
| Supabase 模式 `dbTool()` | 197-247 | REST API 驱动的任务/日志操作 |
| 自动降级 `callTool()` | 249-260 | 优先 DB，失败回退本地 |
| MCP 协议处理器 | 280-333 | stdin/stdout JSON-RPC 2.0 |

#### .env.example — 环境变量模板

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
EV_HOME=./.ev                  # 本地兜底目录
EV_PROJECT=my-project          # 项目名（默认取当前目录名）
```

#### docs/ev.md — 规则文件

用户将此文件复制到 IDE 的 `.trae/rules/ev.md`（Trae IDE）或 `.cursorrules`（Cursor），AI 就会自动遵守协议。

#### docs/mcp.json — 配置模板

```json
{
  "mcpServers": {
    "ev": {
      "command": "node",
      "args": ["/path/to/ev-mcp/index.js"],
      "env": {
        "EV_HOME": "/path/to/project/.ev",
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ..."
      }
    }
  }
}
```

用户修改路径后放置到 IDE 的 `.trae/mcp.json`。

---

## 6. 工具列表

| 工具 | 参数 | 说明 |
|------|------|------|
| `ev_status` | 无 | 读取任务状态，返回 [SDR] 汇总行 + 任务清单 |
| `ev_add_task` | `title`, `description` | 登记新任务，返回 EV-000x 单号 |
| `ev_done` | `id` | 标记任务为完成 |
| `ev_harvest` | 无 | 收割所有 done 任务，标记为 harvested |
| `ev_log_message` | `role`, `content`, `session_id?` | 记录对话消息 |

---

## 7. 开发过程中的踩坑经验

### ⚠️ 踩坑 1：`desc` 字段名与 PostgreSQL 保留字冲突

**现象**：POST `/evops_tasks` 返回 `400 PGRST204`（空 body 无法解析）

**原因**：代码中用了 `desc` 作为字段名，但 PostgreSQL 中 `DESC` 是保留关键字，PostgREST 拒绝处理。

**解决**：通过查询现有表结构，发现实际字段名为 `description`，统一修正所有代码中的字段名。

**教训**：对接已有数据库时，**先 query 表结构**，不要假设字段名。

```javascript
// ❌ 错误：假设字段名
await sb("POST", "evops_tasks", { id, title, desc: args.description });

// ✅ 正确：先查 schema
// curl "https://xxx.supabase.co/rest/v1/evops_tasks?limit=1"
// → 实际字段: description, type, source, priority ...
await sb("POST", "evops_tasks", {
  id, title, description: args.description,
  type: "feature", source: "mcp", priority: "P2"
});
```

### ⚠️ 踩坑 2：PostgREST `return=minimal` 导致空 body

**现象**：`await res.json()` 抛出 `"Unexpected end of JSON input"`

**原因**：POST 请求用 `return=minimal` 头，Supabase 返回 `201 Created` 且 body 为空。`res.json()` 解析空字符串失败。

**解决**：统一改为 `await res.text()` → 空字符串返回 `[]` → 非空再 `JSON.parse`。

```javascript
// ❌ 会崩溃
const data = await res.json();

// ✅ 安全处理
const txt = await res.text();
if (!txt) return [];
return JSON.parse(txt);
```

### ⚠️ 踩坑 3：npm 依赖安装失败 → 意外收获零依赖

**现象**：`npm install @supabase/supabase-js` 多次执行，`node_modules` 中的 `index.js` 内容为空。

**原因**：原 evops-mcp 目录存在权限问题，文件系统写入受阻。

**解决**：
1. 绕过原目录，在 demo-project 下新建 `.ev-mcp` 目录
2. **放弃 npm 依赖**，改用 Node 18+ 原生 `fetch` 直连 Supabase PostgREST REST API
3. 这是一个意外收获——零依赖让项目更轻量、更可移植

**教训**：不要执着于"安装依赖"。Node.js 内置能力已经足够强大，用 `fetch` 直接调用 REST API 往往比引入 SDK 更简洁。

### ⚠️ 踩坑 4：本地与远端状态同步的一致性

**现象**：Supabase 连接偶尔不稳定，如果单点依赖会导致服务不可用。

**解决**：实现 **自动降级策略** —— `callTool()` 优先尝试 Supabase，失败时自动回退本地文件存储，服务零中断。

```javascript
async function callTool(name, args) {
  if (SB_URL && SB_KEY) {
    try {
      return await dbTool(name, args);  // 优先 Supabase
    } catch (e) {
      console.error("[ev-mcp] DB error, falling back to local:", e.message);
    }
  }
  return localTool(name, args);  // 兜底本地
}
```

---

## 8. GitHub 独立仓库方案

### 8.1 仓库定位

**ev-mcp 是一个独立项目，不隶属于任何具体业务项目。**

它的定位类似 `eslint`、`prettier` —— 是一个**开发者工具**，被安装到各个 IDE 项目中使用，但自身独立维护。

### 8.2 推荐仓库名

```
github.com/<your-username>/ev-mcp
```

| 属性 | 值 |
|------|-----|
| Name | `ev-mcp` |
| Description | `AI Task & Chat Tracker — Supabase 持久化，零依赖 MCP Server` |
| Topics | `mcp`, `supabase`, `task-management`, `ai-tools`, `trae-ide` |
| License | MIT |
| Visibility | Public |

### 8.3 三件套安装（使用者视角）

```bash
# 1. Clone
git clone https://github.com/<you>/ev-mcp.git ~/.ev-mcp

# 2. 配置 .env
cp ~/.ev-mcp/.env.example ~/.ev-mcp/.env
# 编辑填入自己的 Supabase 凭据

# 3. 安装到 IDE
#   → 复制 docs/mcp.json 到项目 .trae/mcp.json
#   → 复制 docs/ev.md 到项目 .trae/rules/ev.md
#   → 重启 IDE
```

---

## 9. 关键原则总结

1. **零依赖优先** —— Node.js 内置 `fetch` 足以搞定 Supabase REST API，不要为了一个 `import` 引入 100 个包
2. **先看 Schema 再写代码** —— 对接已有数据库时，先 `SELECT * FROM table LIMIT 1` 看字段名
3. **自动降级不中断** —— 远端服务总有波动，本地兜底保证工具永远可用
4. **独立仓库管理** —— 不要把基础设施代码耦合在业务项目里，ev-mcp 是独立工具
5. **凭据不入库** —— `.env` 进 `.gitignore`，提供 `.env.example` 模板即可
6. **规则驱动行为** —— `ev.md` 定义 AI 行为协议，换个 IDE 照样生效
7. **三件套缺一不可** —— mcp.json (连接) + ev.md (纪律) + ev-mcp Server (能力) 共同完成对话日志的记录