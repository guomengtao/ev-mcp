# Project Rules — guomengtao workspace (Trae)

## Hard Gate 0 — Claim before edit (总纲 §3.11, MANDATORY)

> **⭐ 先领取任务单，认领之后再开始干活（铁的先后顺序，最高优先级）**：任何非免登记工作，必须**严格按顺序先完成下方 1-3 步 → 拿到任务认领（claim）→ 确认认领成功后，才允许编辑/创建任何文件**。顺序不可颠倒——**先领单、后开工；没有认领，就没有动手资格**。未认领就编辑 = 违规操作，会被晨割点名、WIP 会被标记、commit 会被预提交门禁拦截。免登记仅限 §4.4 纯文档/纯查询/单文件 ≤5 行。

> **🔒 多文件必领单（2026-10-09 用户增订）**：**凡本次改动涉及 >1 个文件，必须先申请到任务单**；**没有任务单，一律禁止修改任何代码**。单文件 ≤5 行的免除仍适用，但一旦跨 >1 个文件，无论改动多小都得先领单。

> **🔄 ev-mcp 独立系统（2026-10-13 制定 · 2026-10-18 定为铁律）**：Trae **必须先走且只走**自己的 ev-mcp MCP 任务系统（`evm-trae-*` 单号），**一律禁止**再使用 workbuddy 的老 `evtask-*` 云端（`task-register`/`task-close`/`ev-claim.sh`/`ev-session-name.sh`）。老 `evtask-*` 体系仅供 Claude/CodeBuddy 使用。两套并存、互不干扰，**Trae 绝不跨系统混用**。
>
> **🚫 Trae 禁用清单（2026-10-18 用户指定，违反即违规）**：Trae 会话内**不得**调用 workbuddy 的 `task-register`/`task-close`/`task-notify`/`task-ping`、`ev-claim.sh`、`ev-session-name.sh`，**不得**领取/关闭 `evtask-*` 单号，**不得**关闭他仓/他人 `evtask-*` 任务（含"晨割/收割孤儿任务"）。Trae 一切任务生命周期（领单、收尾、收割）只经 ev-mcp 的 `ev_add_task` / `ev_start` / `ev_done` / `ev_harvest`。

**Trae — 领单（ev-mcp MCP，唯一通道）：**

```bash
# 方式一：通过 MCP 工具调用（AI 在会话内调用，无需命令行）
# 工具名: ev_add_task  参数: { "title": "任务名", "description": ">=50字描述" }
# 生成单号格式: evm-trae-{project}-{YYMMDD}-{HHMM}-{random4}

# 方式二: 命令行直调（测试/脚本用）
# 直接用 node 调 MCP 服务器 stdin/stdout
```

**Claude/CodeBuddy — 领单（老 evtask，保留兼容）：**

1. **Banner notify** (non-blocking, fire-and-forget):
   ```bash
   ~/.workbuddy/scripts/task-notify.sh "▶ <task name>" "<context>" "<claimed or not>"
   ```
2. **Register a formal ticket** (required for anything beyond pure docs/query):
   ```bash
   curl -sS -X POST "https://app-auth.gudq.com/api/ev?action=task-register" \
     -H 'Content-Type: application/json' \
     -d '{"type":"develop","title":"<task>","assignee":"codebuddy","project":"<repo>","priority":"P2","session":"<your-session-id>","description":"<>=50 chars: goal, scope, acceptance>"}'
   ```
3. **Claim the files** (inserts a row into PROJECT-MAP.md):
   ```bash
   ~/.workbuddy/scripts/ev-claim.sh claim --topic "<task>（<evtask-id>）" \
     --files "<relative paths, comma-separated>" --repo <repo path>
   ```

**Why**: Claude/CodeBuddy sessions are enforced by a PreToolUse hook (`~/.claude/hooks/ev-claim-guard.sh`). Trae has NO hook enforcement — these rules are the ONLY thing standing between you and polluting a shared multi-AI workspace. Violations are harvested daily by MorningCut (晨割 v3): any claim idle > 6h is closed as "no owner", and your uncommitted WIP gets flagged in PROJECT-MAP.md.

## Hard Gate 1 — Edit files in the editor, NEVER via shell (2026-10-18, MANDATORY)

> **✍️ 文件的新建与修改，一律走编辑器的文件编辑能力**（`Write` / `Edit` / `MultiEdit` / 应用 diff 补丁）；**终端只用于执行不改工作区内容的命令**（`git status`、`git log`、测试、构建、lint、查询）。

**禁止在终端里用下列方式创建或修改文件内容**（命中即被 `ev-agent-guard` 拦截）：

| 形式 | 示例 |
|---|---|
| 输出重定向 | `cat > a.ts`、`echo x >> README.md`、`printf ... > out.txt`、`: > app.log` |
| here-document | `cat << EOF > a.txt`、`git commit -F - <<EOF` |
| tee 落盘 | `npm run build \| tee build.log` |
| 原地编辑 | `sed -i 's/a/b/' f`、`perl -i -pe ...` |
| 解释器内联写 | `python3 -c "open('a','w').write(...)"`、`node -e "writeFileSync(...)"` |
| 显式写盘 | `truncate`、`install`、`patch` |

**放行**：只读命令、版本控制命令（`git add/commit/push` 等）、测试与构建命令，以及**写入临时区**（`/tmp`、`$TMPDIR`、`/var/folders/**/T`）的日志。

**为什么这样要求（有实证）**：

1. **回显洪水**：经终端写文件，整份内容会原样进入 pty。写 200 行代码就等于向 xterm.js 灌 200 行 —— 这是"终端崩溃"最直接的成因。
2. **命令挂死**：heredoc 遇到中文、缩进或特殊字符（`` $ \ ` ! ``）转义失败后，会一直等待结束标记，命令**永不退出**。插件据此判定 `busy` 卡死，于是不断新开终端 → 孤儿进程堆积。
   - **本机实证**：`~/Library/Application Support/Code/logs/*/ptyhost.log` 中 **12 个 Persistent process 全部 orphan → reconnection → Replaying**（最大 8372 chars）。
3. **不可回滚**：shell 写坏的文件既无 diff 也无法撤销；编辑器编辑有 diff 预览与 Ctrl+Z。

**这并非限制，而是分工**：编辑器负责"改内容"，终端负责"跑命令"。插件本身已具备两条通道（`run_command` 与 `writeFile` / `applyEdit` / `WorkspaceEdit`），本规则只是把"改内容"固定走后者。

> **终端侧兜底**：自动化终端已挂 `ev-agent-guard`（`~/.workbuddy/scripts/ev-agent-guard.sh`，经 `automationProfile.osx` 的 `ZDOTDIR` 加载）。命中写文件命令时会打印上面这张表并阻止执行 —— **该提示会被插件回读**，从而自动切换到编辑器通道。用户手动打开的终端不受影响。

## File-count ladder (mirrors WorkBuddy's claim_guard.py — 2026-10-08)

The WorkBuddy/Claude gate enforces this mechanically; Trae must self-enforce:

- **1st unclaimed file** in a session → allowed (logged, "fast lane"), finish small work and commit.
- **2nd unclaimed file** → **STOP. Register ticket + claim BEFORE editing.** One file of slack is all you get.
- Every further file → same: no claim, no edit.
- The count resets only by claiming (`ev-claim.sh claim`) or ending the session. Switching repo does NOT reset it.
- A claim covers only the files listed in it — editing any file NOT in your claim list counts as unclaimed.

## Hard gates you must also honor

- **🛑 NEVER run Vela emulator**: Trae 禁止调用 `vela.py up/ls/push/nav/tap/shot/down` 等任何 Vela 模拟器命令。RPK 只负责编译打包，验证由用户在本地终端执行。
- **Git pre-commit gate**: every repo here blocks commits with unclaimed files. If your commit is rejected, follow its instructions — do NOT use `SKIP_CLAIM=1` unless genuinely exempt (single file ≤ 5 lines / pure .md ≤ 50 lines, §4.4).
- **Session begin**: re-read `多人多AI统一协调开发总纲.md` change log before working (see skills/session-discipline SKILL.md).
- **Don't touch others' WIP**: check `git status` + PROJECT-MAP.md claim rows first. Files you didn't claim are not yours — leave them byte-for-byte untouched.
- **One in-progress task per session, one ev-mcp evm ticket at a time**: `ev_done` the old ticket before registering a new one (status: done/cancelled/blocked).

## Trae Hook Equivalent — self-enforced, same scripts as Claude/CodeBuddy (2026-10-09)

Trae has **no native hook events** (no `PreToolUse`, `PostToolUse`, `SessionStart`). Claude/CodeBuddy auto-fire these via `settings.json`. To close the gap, Trae MUST self-enforce equivalents using the **same shared scripts** in this repo — single source of truth, zero drift.

Script locations (shared with Claude/CodeBuddy):
| Script | Path | What it does |
|---|---|---|
| claim guard | `tools/hooks/claim_guard.py` | PreToolUse: checks if file is claimed before edit |
| edit stats | `tools/hooks/edit_stats.py` | PostToolUse: accumulates adds/dels per file per task |
| SDR + 日志 | `ev/ev-mcp/index.js` | ev_status (SDR表格) + ev_log_message (对话落库) |

### PreToolUse equivalent — claim guard BEFORE every Write/Edit/MultiEdit

**MANDATORY: before every file edit**, simulate the PreToolUse hook:

```bash
echo '{"session_id":"<trae-sid>","hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"filePath":"<absolute-path>"},"cwd":"/Users/Banner/Documents/guomengtao"}' \
  | python3 tools/hooks/claim_guard.py
```

- **Exit 0, no stdout** → proceed.
- **Stdout contains `permissionDecision: "deny"`** → STOP, read `permissionDecisionReason`, complete the claim triple, then retry.
- **Script crashes** → fail-open, proceed (same as Claude/CodeBuddy hooks).

### PostToolUse equivalent — edit stats AFTER every Write/Edit/MultiEdit

```bash
echo '{"session_id":"<trae-sid>","tool_name":"Edit","tool_input":{"filePath":"<absolute-path>"},"tool_response":{"structuredPatch":[{"lines":["+added line","-removed line"," context"]}]},"cwd":"/Users/Banner/Documents/guomengtao"}' \
  | python3 tools/hooks/edit_stats.py
```

This writes adds/dels into the session blackboard (`data/active/<sid>.json`).

### Session Welcome Flow — 会话欢迎流程 (4 steps, once per session, MANDATORY)

**Every new Trae session MUST complete the 4-step Welcome Flow before accepting ANY user task.** This replaces the old single-step SessionStart. The flow establishes developer identity, registers the session, reports daily stats, and declares readiness. Steps must be executed in order — no skipping, no reordering.

---

#### Step 1 — 花名（昵称）设置

**Pick a playful, memorable nickname (花名) and immediately report it to the user.** 俏皮、好记、2~4 字中文。Examples: `小铁锤`, `闪电猫`, `螺丝钉`, `代码蚂蚁`, `小板凳`. Not too formal, not too long.

Keep the **same nickname for the entire session** — do not change it mid-session. This nickname becomes the `title` field in all hook payloads, visible on the EvOps Dashboard and App task detail.

**Report format:**
```
🔨 我是【花名】，本场会话由我为你干活。
```

---

#### Step 2 — 登记会话记录

**ev-mcp 启动时自动在 Supabase `ev_mcp_sessions` 表创建会话记录。** 如需显式命名花名，调用 MCP 工具 `ev_name_session`。

Output: creates `ev_mcp_sessions` row in Supabase (auto on server start).

---

#### Step 3 — 今日统计报告

**Report today's cumulative stats from Supabase `ev_mcp_tasks` 表（通过 ev_status 工具获取）。**

| Stat | Meaning | Source |
|---|---|---|
| 领取 | Tasks registered today | `ev_mcp_tasks` by `created_at` |
| 完成 | Tasks done today | `ev_mcp_tasks` status=done/harvested |
| 进行 | 当前 doing 的任务 | `ev_mcp_tasks` status=doing |
| 对话 | 本轮会话对话次数 | ev_status 返回的 roundCount |

**Report format** (single line, compact):
```
💬 今日 N 轮 ｜ 📥 领 N · ✅ 完成 N · 🔵 进行 N（evm-trae-ev-mcp-xxxxxx 任务名）
```
> 无任务时显示 `🔵 进行 0`

> If Supabase is unreachable, skip this step with a warning — never block the session on stats.

---

#### Step 4 — 就绪声明

**Explicitly declare readiness.** This is the signal that the AI has finished initialisation and is ready to accept tasks.

**Format:**
```
✅ 准备就绪。告诉我干什么，我开工。
```

---

#### Flow summary

```
新会话开始
  → Step 1  🔨 我是【花名】
  → Step 2  ☁️  会话立案
  → Step 3  📊 今日战报
  → Step 4  ✅ 准备就绪
  → 等待用户任务
```

### UserPromptSubmit equivalent — 每次收到用户消息：SDR + 日志

**On every user message**, Trae MUST do TWO things:

1. **Call `ev_status` via MCP** — 获取 SDR 表格并附在回复末尾。
2. **Call `ev_log_message` via MCP** — 将本消息写入 `ev_mcp_logs` 表（role=user, content=用户消息原文）。

**Reply format**: 在回复末尾附上 ev_status 返回的完整 SDR 表格。

### SessionEnd equivalent — close session

调用 ev_status 最后确认一次 SDR 状态即可。ev-mcp 进程退出时会话自然关闭。

> **Fail-open rule**: if any hook-equivalent script errors (network down, missing file, etc.), log it and continue — never block real work. This matches the Claude/CodeBuddy hook timeout/error behaviour.

## Multi-step work (总纲 §3.13)

If the task touches ≥ 2 files / needs ≥ 3 commits / needs repeated verification / is cross-repo → write `docs/<task>-plan.md` FIRST (7 required sections), get EXPLICIT user approval (silence ≠ consent), THEN register + claim.

## EvEmuBuddy 改完即部署（2026-10-10 用户铁律）

> **每次改动 `ev/ev-emubuddy/` 下的 `.py` 源码后，必须立即执行三件套，不可遗漏：**
> 1. `cp` 进 `.app/Contents/Resources/`
> 2. `rm -rf __pycache__`
> 3. `kill` 旧进程 + `open` 重启

**标准命令**（改完代码最后一步，始终执行）：
```bash
cp ev/ev-emubuddy/emu_buddy.py /Applications/EvEmuBuddy.app/Contents/Resources/emu_buddy.py && \
cp ev/ev-emubuddy/emubuddy_core.py /Applications/EvEmuBuddy.app/Contents/Resources/emubuddy_core.py && \
rm -rf /Applications/EvEmuBuddy.app/Contents/Resources/__pycache__ && \
kill $(pgrep -f "emu_buddy.py") 2>/dev/null; sleep 1 && \
open /Applications/EvEmuBuddy.app
```

## 晨割别名（EV-morning）

晨割 / 晨清 / Morning Zero-Cut / **`EV-morning`** 均指同一件事：每日开工（或项目沉睡超 6h 后唤醒）先做的一次切割清场，将隔夜遗留历史包袱收尾、提交干净后再开始新活。**命令、脚本、日志、文档标题统一用英文别名 `EV-morning` 指代晨割触发与清场动作**；协议正文见 `docs/晨割协议-日切归零方案.md`。