# ev-mcp 花名（会话昵称）流程 · 完整记录与适应手册

> 编写：2026-10-13 · 依据源码实测核写：
> - `ev/ev-mcp/index.js`（MCP 侧花名门禁 + `ev_name_session` 落库）
> - `~/.trae-cn/extensions/evops.trae-session-plugin-0.1.4/`（Trae Session Isolator 插件侧花名）
> 定位：说清「花名是什么」「谁在哪存」「AI 该怎么起」「两个花名怎么协同」。
> 状态：本会话已实测确认「花名门禁仍生效」。

---

## 〇、一句话总览

系统里存在**两套独立的花名**，同名但不同源、互不影响，都会「管」到本会话：

| 体系 | 花名存哪 | 由谁管理 | 用途 |
| --- | --- | --- | --- |
| **ev-mcp 花名** | Supabase `ev_mcp_sessions.name` | MCP 工具 `ev_name_session` | **解锁 ev-mcp 全部业务工具**（ev_add_task 等）——没它门禁挡死 |
| **插件花名** | workspace `data/active/{sid}.json` | Trae Session Isolator 命令 `trae-session.nameSession` | 会话身份显示、台账归因（不挡任何工具） |

> ⚠️ **两套花名不自动同步**。要给 ev-mcp 用，必须走 `ev_name_session`；要给插件显示，走插件命令。想联动需另做改造（见 §六）。

---

## 一、为什么有「花名门禁」

ev-mcp（`index.js`）的设计：**任务、日志都要归属到「一个有名分的会话」**。为避免脏数据/孤儿会话，源码用一个硬门禁：

- 允许无花名操作的工具只有 2 个：`ev_status`（看状态）、`ev_name_session`（起名）
- **其余所有工具**（`ev_add_task` / `ev_start` / `ev_done` / `ev_harvest` / `ev_log_message`）未起花名前一律拒绝

### 实测证据（2026-10-13，本会话复现）

未起花名时调用 `ev_add_task`，返回：

```
🚫 尚未设置花名！
必须自己起名，不要问我——请立即调用 ev_name_session 自己起一个名字
（须含 emoji，如 🔨小铁锤、🐘象往），不要问用户，这是 AI 自己的职责。
```

**结论：门禁真实生效、可复现、当前状态正常。**

---

## 二、花名规则（源码逐条）

| 条款 | 规则 | 出处 |
| --- | --- | --- |
| 谁起名 | **AI 自己起，禁止问用户** | `ev_name_session` 描述 + 总纲 §3.3a |
| 名字要求 | ≤8 汉字，须含 1 个 emoji（如 🐘象往、🔨小铁锤） | MCP 工具描述 + 门禁提示 |
| 唯一性 | 同项目内不能重名（查 Supabase 校验，重复拒绝） | `dbCheckNameUnique` |
| 落库 | 写入 Supabase `ev_mcp_sessions.name` | `ev_name_session` 处理分支 |
| 生效 | 设置后当前进程内 `sessionName` 立即生效，门禁解锁 | `dbTool` 内 `sessionName = newName` |

---

## 三、AI 该怎么做（标准流程）

> 每次会话开场，AI 检测到门禁拦截后，按下面走。全程不问用户。

### 3.1 判断要不要起名

- 调用 `ev_status`，看 SDR 表格里 `花名` 一栏：
  - `❓未命名` → **需要起名**，走 3.2
  - 已有花名 → 无需重起，直接干活

### 3.2 自己起名 + 调用 `ev_name_session`

1. 按规则起名：**≤8 汉字 + 含 1 个 emoji**，有画面感（例：🌙深夜嘴替、🔨小铁锤、🐘象往）。
2. 调用工具：
   ```
   ev_name_session(name="🐘象往")
   ```
3. 成功返回：`🌸 会话花名已定为：🐘象往`
   - 若返回「花名已被占用」→ 换一个名字重试（直到唯一）。

### 3.3 起名后验证

- 再调 `ev_status`：SDR 里 `花名` 不再是 `❓未命名`。
- 首次调 `ev_add_task` 即可放行，门禁解锁。

---

## 四、插件侧花名（Trae Session Isolator）

插件（Trae Session Isolator）自带独立花名，机制如下：

### 4.1 存储

- 路径：`{workspace}/data/active/{sid}.json`（台账，`sid = vscode.env.sessionId` 或心跳复用的旧 sid）
- 字段：`sid` / `created_at` / `workspace` / `pid` / `name`

### 4.2 复活机制（实测 session.js）

- `resolveSid()`：心跳窗口内（默认 6 小时）且进程不冲突 → **复用旧 sid，连带复用旧花名**（`readLedgerName()`）；否则新建 sid、花名置空。

### 4.3 怎么起名

- 命令面板 `Cmd+Shift+P` → `Trae Session: 起花名`
- 或 AI 以命令参数调 `trae-session.nameSession`（带 `arg.name` 则不弹框，直接写入）
- 写入后 `writeLedger()` 落台账

---

## 五、两条花名的关系与边界（重要）

| 场景 | ev-mcp 花名 | 插件花名 | 会不会挡工作 |
| --- | --- | --- | --- |
| 只起 ev-mcp 花名 | ✅ 有 | ❌ 无 | 不挡 ev-mcp 工具；插件显示名缺省 |
| 只起插件花名 | ❌ 无 | ✅ 有 | **ev-mcp 业务工具仍被门禁挡死** |
| 两个都起 | ✅ | ✅ | 全部放行，仅显示各自独立 |
| 都不起 | ❌ | ❌ | ev-mcp 仅能用 `ev_status`/`ev_name_session` |

> **关键提醒**：如果你指望「插件起了名，ev-mcp 的门禁就开了」——**错了**。它们各自校验各自的，要过 ev-mcp 门禁必须调 `ev_name_session`。

---

## 六、让两套花名联动（可选改造点）

如果你希望「起一次名，两边都生效」，需要 3 选 1（未实现，属待办）：

| 方案 | 做法 | 成本 |
| --- | --- | --- |
| A. MCP 拉插件名 | 改 `index.js`，`ev_name_session` 落库前先读 `data/active/{sid}.json` 的 `name` | 低，但依赖工作区路径可读 |
| B. 插件推 MCP | 插件的 `setName()` 成功后调 ev-mcp 的 REST/回写 Supabase | 中，需插件加网络层 |
| C. 统一真源 | 把花名真源收敛到一处（如 Supabase），插件与 MCP 都读它 | 高，但最干净 |

> 现状维持"两套独立"也能跑，只是要记住：**ev-mcp 起名必须走 `ev_name_session`**。

---

## 七、快速自查清单

```
[ ] 调 ev_status 看 SDR 花名是否 ❓未命名
[ ] ❓未命名 → AI 自己起名（≤8字含 emoji）→ ev_name_session
[ ] 返回 🌸 已定为 xxx → 再 ev_status 确认花名栏更新
[ ] ev_add_task/ev_log_message 放行 → 门禁解锁 ✅
[ ] （插件显示如需花名）另走 Trae Session: 起花名
```

---

> 关联阅读：
> - `ev-mcp使用帮助-读不到MCP排查.md`（读不到 MCP 怎么查）
> - `Trae-AI-agent会话快照机制深度分析.md`（Trae 会话 ID 机制）
> - 总纲 §3.3a（提交署名 = 会话花名）、§3.10（花名仅作显示，唯一键是 sid）