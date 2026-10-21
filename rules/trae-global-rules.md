# Trae 全局规则

> **真源位置**：`ev/ev-mcp/rules/trae-global-rules.md`（纳入 git 版本控制，换机不丢失）
> **加载方式**：`~/.trae/rules/project_rules.md` → **软链**指向本文件（单一真源，不漂移）
> **适用范围**：所有 Trae IDE 会话，跨项目生效
> **操作手册**：`ev/ev-mcp/docs/ev-mcp-Trae领单与花名手册.md`（分步操作详解）

---

## 〇、与总纲的关系

**本文件是 Trae 的独立规则（领单 / 花名 / 门禁），不重复总纲的公共开发规范。**

- 公共开发规范（兼容性、版本发布、Git 纪律、跨端协议、签名密钥）→ 见 `多人多AI统一协调开发总纲.md`（Trae + WorkBuddy 通用）
- WorkBuddy 独立规则（花名 / 领单 / SDR / 钩子）→ 见 `ev/ev-hooks/docs/WorkBuddy会话纪律-花名领单SDR钩子.md`
- **本文件 = Trae 独立规则**（ev-mcp 领单 + 花名 + 门禁）

---

## 一、领单与花名体系（ev-mcp 独立，唯一通道）

### 1.1 为什么独立

- **workbuddy 体系**（`ev-claim.sh` / `ev-add-task.js` / `ev-session-name.sh`，读本地 `workbuddy.db`、打 `app-auth.gudq.com` API）是**另一个运行环境**的产物，不适用于 Trae。
- **ev-mcp 体系**（`ev/ev-mcp/index.js`，一个零依赖 MCP Server）是为 **Trae IDE 这类 AI 客户端**设计的：AI 直接调 MCP 工具，走 Supabase 线上存储，落 `ev_mcp_sessions`（花名）+ `ev_mcp_tasks`（任务/单号）+ `ev_mcp_logs`（对话）。

### 1.2 两套单号体系对照（防混淆）

| 维度 | **Trae（本规则）** | workbuddy（另一环境） |
| --- | --- | --- |
| 领单 | ev-mcp `ev_add_task` → **`evm-`** 单号 | `task-register` / `ev-add-task.js` → `evtask-` 单号 |
| 花名 | ev-mcp `ev_name_session` | `ev-session-name.sh` |
| 落库 | Supabase：`ev_mcp_sessions` / `ev_mcp_tasks` / `ev_mcp_logs` | 后端 `app-auth.gudq.com` |
| 实现 | `ev/ev-mcp/index.js`（MCP Server，零依赖） | `ev/ev-hooks/` 脚本 + 钩子 |

> **两套单号体系不相通**：`evm-`（ev-mcp）≠ `evtask-`（workbuddy）。Trae 只认 `evm-`，引用时写明来源。

---

## 二、铁律（Hard Gates，最高优先级）

### Gate 0：先领单、后开工

> 任何非免登记工作，必须**严格按顺序**先领单 → 确认认领 → 才允许编辑文件。**先领单、后开工；没有认领，就没有动手资格。**
>
> **多文件必领单**：凡改动涉及 >1 个文件，必须先申请到 `evm-` 单号；单文件 ≤5 行免登记仍适用，但跨文件无论多小都得先领单。

### Trae 禁用清单

Trae 会话内**不得**调用以下 workbuddy 工具：
- `task-register` / `task-close` / `task-notify` / `task-ping`
- `ev-claim.sh claim` / `ev-claim.sh release`
- `ev-add-task.js` / `ev-session-name.sh`
- 不得领取或关闭 `evtask-*` 单号
- 不得关闭他仓/他人 `evtask-*` 任务

Trae 一切任务生命周期（领单、收尾、收割）**只经 ev-mcp**：`ev_add_task` / `ev_start` / `ev_done` / `ev_harvest`。

### File-count ladder（文件计数阶梯）

- **第 1 个未认领文件** → 允许（记入快速通道，改完立即提交）
- **第 2 个未认领文件** → **停手。先领单再编辑。**
- 此后每多一个文件 → 无认领不编辑
- 计数器仅通过认领或结束会话重置；切换仓库不重置
- 认领仅覆盖指定文件，编辑认领列表外的文件 = 未认领

---

## 三、标准流程速查

### Step 1 · 起花名

1. 调 `ev_status` → 看 SDR 表格 `花名` 栏：
   - `❓未命名` → 需起名
   - 已有花名 → 跳过
2. **AI 自己起，禁止问用户**：
   `ev_name_session(name="🐘象往")`   （≤8 汉字，含 ≥1 emoji，同项目唯一）
3. 花名门禁：未设花名前，除 `ev_name_session` / `ev_status` 外全部工具拒绝。

### Step 2 · 领单

```
ev_add_task(title="任务标题", description="目标+改动范围+验收，≥50 字")
```

返回单号：**`evm-{tool}-{proj}-{yymmdd}-{hhmm}-{rand}`**

### Step 3 · 推进与收尾

| 动作 | 工具 | 说明 |
| --- | --- | --- |
| 开始 | `ev_start(id=单号)` | 置 doing |
| 记对话 | `ev_log_message(...)` | 有进行中任务必须带 `task_id` |
| 完成 | `ev_done(id=单号)` | 置 done |
| 看状态 | `ev_status` | SDR 表格，每轮开场必调 |
| 收割 | `ev_harvest` | 列出已 done |

### Step 4 · 快速通道（免登记）

以下情况无需领单：
- 仅咨询 / 问答 / 查代码
- 纯 `.md` ≤50 行
- 单文件代码改动 ≤5 行

---

## 四、会话开工检查清单

每次 Trae 会话首次动工前：

- [ ] 重读总纲变更日志（`多人多AI统一协调开发总纲.md` §〇），判断是否有新修订
- [ ] 调 `ev_status` 查看 SDR 表格
- [ ] 花名未设 → `ev_name_session` 起名
- [ ] 有实质改动 → `ev_add_task` 领单
- [ ] 检查 `git status` + PROJECT-MAP.md 认领行，不动他人 WIP
- [ ] 一个会话最多一个进行中 `evm-` 任务

---

## 五、参考

- 操作详解：`ev/ev-mcp/docs/ev-mcp-Trae领单与花名手册.md`
- MCP 未加载排查：`ev/ev-mcp/docs/ev-mcp使用帮助-读不到MCP排查.md`
- 公共开发规范：`多人多AI统一协调开发总纲.md`
- 本文件变更日志：git log `ev/ev-mcp/rules/trae-global-rules.md`