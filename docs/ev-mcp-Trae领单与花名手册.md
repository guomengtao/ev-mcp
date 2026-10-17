# ev-mcp · Trae 领单与花名操作手册

> 编写：2026-10-17 · 依据 `ev/ev-mcp/index.js` 源码 + 用户裁定（Trae 独立走 ev-mcp）
> 用途：Trae IDE 会话专用的「领单 + 花名」标准操作指南。配套规定见 `ev/class-schedule/.trae/rules/project_rules.md` §13、总纲 §3.11。
> 核心：**Trae 运行环境与 workbuddy 不同，领单/花名一律走 ev-mcp（MCP Server），不与 workbuddy 的脚本体系（`ev-claim.sh` / `ev-add-task.js` / `ev-session-name.sh`）混用。**

---

## 〇、两套体系对照（防混淆）

| 维度 | **Trae 该用（本手册）** | workbuddy 体系（另一环境，不用） |
| --- | --- | --- |
| 领单 | ev-mcp `ev_add_task` → `evm-` 单号 | `task-register` / `ev-add-task.js` → `evtask-` 单号 |
| 花名 | ev-mcp `ev_name_session` | `ev-session-name.sh` → `workbuddy.db` |
| 落库 | Supabase：`ev_mcp_sessions` / `ev_mcp_tasks` / `ev_mcp_logs` | 后端 `app-auth.gudq.com` |
| 实现 | `ev/ev-mcp/index.js`（MCP Server，零依赖） | `ev/ev-hooks/` 脚本 + 钩子 |

> **两套单号体系不相通**：`evm-`（ev-mcp）≠ `evtask-`（workbuddy）。Trae 只认 `evm-`，引用时写明来源。

---

## 一、前置：必须能读到 MCP

- 工具列表里须有 `ev_status` / `ev_add_task` / `ev_name_session` / `ev_start` / `ev_done` / `ev_harvest` / `ev_log_message`。
- 读不到排查：→ `ev-mcp使用帮助-读不到MCP排查.md`、`故障复盘-MCP未加载根因分析.md`。

---

## 二、标准流程（每次 Trae 会话开工）

### Step 1 · 起花名（`ev_name_session`）

1. 调 `ev_status` 看 SDR 表格 `花名` 栏：
   - `❓未命名` → 需要起名，走 Step 1.2。
   - 已有花名 → 跳过，直接 Step 2。
2. **AI 自己起名，禁止问用户**：
   ```
   ev_name_session(name="🐘象往")   # ≤8 汉字，含 ≥1 emoji
   ```
3. 返回 `🌸 会话花名已定为：🐘象往` → 解锁。若「花名已被占用」→ 换名重试。

### Step 2 · 领单（`ev_add_task`）

1. 任何实质任务先领单：
   ```
   ev_add_task(title="任务标题", description="目标+改动范围+验收，≥50 字")
   ```
2. 返回单号：**`evm-{tool}-{proj}-{yymmdd}-{hhmm}-{rand}`**。

### Step 3 · 开始/推进/收尾

| 动作 | 工具 | 说明 |
| --- | --- | --- |
| 开始 | `ev_start(id=单号)` | 置 doing |
| 记对话 | `ev_log_message(...)` | 有进行中任务必须带 `task_id`，否则拒绝 |
| 完成 | `ev_done(id=单号)` | 置 done |
| 收割 | `ev_harvest` | 列出已 done |

---

## 三、花名门禁（ev-mcp 特有的闸）

- 未设花名前，除 `ev_name_session` / `ev_status` 外全部工具拒绝：
  `🚫 尚未设置花名！……立即调用 ev_name_session 自己起一个名字……`
- **→ 先起名再领单**。

---

## 四、铁律

1. **Trae 禁止跑 workbuddy 的领单/改名脚本**（`ev-claim.sh claim` / `ev-add-task.js` / `ev-session-name.sh`）。
2. **单号只用 `evm-`**，不混编 `evtask-`。
3. 先花名 → 后领单 → 再动手。
4. 本会话若 MCP 工具未挂载，先接入 ev-mcp MCP Server 再实际操作；归属与流程以本文档 + 项目规则 §13 为准。
