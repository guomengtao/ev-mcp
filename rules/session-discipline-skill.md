---
name: "session-discipline"
description: "Enforces session-begin checklist + delivery-before testing gate per the dev master plan (多人多AI统一协调开发总纲 §3.9/§3.15). Invoke at the START of every session before doing any task, and RE-INVOKE before delivering any completed work to the user."
---

# Session Discipline (会话前检查 + 交付前测试门禁)

This skill enforces two hard gates that apply to every session working in the `guomengtao/` ecosystem:

1. **会话前检查 (Session-begin check)** — re-read the master plan before touching anything (§3.9).
2. **交付前测试门禁 (Pre-delivery test gate)** — never hand work to the user until tests have been run and passed (§3.15).

Rules are USA English, no Chinese in code. Follow both gates below every single session.

---

## Gate 0 — Claim Before Edit (§3.11) — ADDED 2026-10-08, HIGHEST PRIORITY

**This gate was missing and caused real violations (2026-10-08: unclaimed edits in ev/class-schedule).**

Trae has NO native hook events (Claude/CodeBuddy sessions auto-fire `ev-claim-guard.sh` on PreToolUse). Since 2026-10-09, Trae self-enforces hook equivalents using the SAME shared scripts — see Gate 3 below. Enforcement layers: (a) self-enforced PreToolUse check before every edit, (b) workspace rules, (c) git pre-commit gate.

**Before your FIRST Write/Edit/MultiEdit of any session, complete the claim triple:**

1. Banner: `~/.workbuddy/scripts/task-notify.sh "▶ <task>" "<context>" "<status>"`
2. Ticket: `POST https://app-auth.gudq.com/api/ev?action=task-register` (session field = your session id; description ≥ 50 chars; close old in-progress ticket first — one per session)
3. Claim: `~/.workbuddy/scripts/ev-claim.sh claim --topic "<task>（<evtask-id>）" --files "<paths>" --repo <repo>`

Exemptions (§3.13): pure docs / pure query / single-file ≤ 5 lines. Anything else = register FIRST, edit SECOND.

**File-count ladder (self-enforced, mirrors claim_guard.py):** the 1st unclaimed file per session is a free "fast lane"; **before editing a 2nd unclaimed file you MUST register the evtask + claim all touched files**. There is no 3rd free file.

> **🔒 多文件必领单（2026-10-09 用户增订）**：凡是本次改动涉及 **>1 个文件**，必须先申请到 **evtask 任务单**；**没有 evtask 任务单，一律禁止修改任何代码**。即便第二步还差一个文件没写进去，也要先领单把该文件 cover 住再动手。单文件 ≤5 行才可用快速通道。

**Enforcement note**: claims idle > 6h are harvested by MorningCut (晨割 v3) as "no owner". Unclaimed edits WILL be discovered via `git status` diffing between workspace snapshots.

---

## Gate 1 — Session-Begin Check (do this FIRST, before any task)

Run these steps at the start of every session, before reading user tasks or editing files.

### Step 1.1 — Detect if the master plan changed

```bash
stat -f "%Sm  %N" -t "%Y-%m-%d %H:%M" \
  ~/Documents/guomengtao/多人多AI统一协调开发总纲.md
```

Compare this mtime with the last time this session read it:

| Situaion | Action |
| --- | --- |
| mtime changed | Re-read only the changed sections per the change log (§〇 table) |
| mtime unchanged AND already read this session | Skip, proceed |
| Cannot tell / >3 days / switched workspace | Do a full read |

### Step 1.2 — Read the changed sections, not the whole file

- The change log (top of §〇) tells you exactly which sections to re-read.
- **If you are about to do real work, always read**: §3.9 (reload), §3.15 (test gate), §4.4 (startup checklist / quick channel), §3.11 (task claim & assignee), §3.13 (multi-step requires .md plan first).
- Apply the same reload mechanism to: `docs/全局规则-改动完成即提交.md`, `docs/CodeBuddy-工作区上手.md`, `docs/WorkBuddy-工作区上手.md`, `PROJECT-MAP.md` (claim region).

### Step 1.3 — Honor all user rules

- All code uses USA English only; no Chinese in code.
- Only one product's detail page may read the online DB; all others read local JSON files and build static HTML.
- Follow the §4.4 startup checklist before touching git (§4.4).

---

## Gate 2 — Pre-Delivery Test Gate (do this BEFORE giving work to the user)

**NEVER say "it's done" or hand code to the user until the test gate below has been run and passed. This is a hard requirement, not optional.**

### Step 2.1 — Classify the change level (L0/L1/L2/L3) *per §3.15 tab ⑨*

| Level | Trigger | Testing required |
| --- | --- | --- |
| **L0** | pure docs / rules / pure query / single-file ≤5 lines not touching interface or logic branch | syntax check only, no test flow |
| **L1** | light change (small UI, minor non-critical logic) | lint + one smoke check |
| **L2** | standard change (normal feature, API/interface untouched) | interface tests + core smoke; P0/P1 100%, P2 ≥95% |
| **L3** | heavy load (release, cross-end protocol change, DB/migration, permission/pay/activation) | full suite; P0/P1 100%, P2 ≥95%, 3 consecutive stable runs |

**Forced upgrade to higher level (5 items):**
- Cross-end protocol change (interconnect message format, telemetry fields)
- Interface signature / DB schema change
- Permission, payment, activation, voucher distribution
- Data migration
- Release / version cut

> If unsure, go HIGHER, not lower.

### Step 2.2 — Run the four-phase test flow (§3.15 tab ②)

Phase each output; get user confirmation before moving on:

| Phase | Do | Output |
| --- | --- | --- |
| **1. Test strategy** | scope, non-scope, risks, env deps, test data plan | short paragraph/table |
| **2. Test cases** | ID, module, priority (P0/P1/P2), preconditions, steps, expected results | case list (right-sized, not padded) |
| **3. Execute** | actually run each case, mark 通过/失败/跳过 | results table |
| **4. Report & fix** | analyze root cause of failures, fix, re-run, final report | pass rate, failure list, root cause, timestamps for flaky |

Failure discipline:
- **Do not skip failures.** Every failure → root cause, fix or documented non-fix reason.
- **Isolate flaky cases** (2-of-3 fails) — mark them, but do not block delivery quietly.

### Step 2.3 — Auto-test rules (§3.15 tab ④)

When writing test scripts:
- Repeatable (3 runs, same result), independent (self-seed + self-clean), data isolated (never touch production).
- Explicit waits, **NO sleep / hard-time**.
- Locate elements via `accessibilityId` / `resource-id`, **NO XPath / hardcoded coordinates**.
- Retry up to 2x per case; still failing → save screenshot + logs + recording as evidence.

### Step 2.4 — Platform-specific additions (§3.15 tab ⑤)

| Platform | Extra checks |
| --- | --- |
| Web (app-auth) | console errors zero-added, failed network requests (404/500), responsive mobile/desktop, deep-link params |
| Android (ev-schedule-android / ev-ops-android) | install/update/uninstall, permissions, weak network, call/lock-screen; `javac` must pass; `adb install -r` on a real device (emulator never substitutes for permissions/BT) |
| Band app (class-schedule / evbox) | `vela` CLI deploy rpk to simulator (§3.8): install OK, home not blank, core pages reachable; `tools/pool.sh refresh` after new rpk (§3.8d); interconnect change must be verified on BOTH band + Android |
| Mac (EvNotifier) | verify `cp` to `/Applications/EvNotifier.app/Contents/Resources/` (§6.4); restart app to verify effect (§6.4); `codesign -dv` still valid |

### Step 2.5 — Evidence & report (§3.15 tab ⑥ + tab ⑩)

- Save evidence to `<project>/docs/<任务名>-测试报告-<日期>.md`.
- Report includes 10 required fields: level, basis/claim number, session/start-end time, scope, case list, pass rate, stability, evidence path, failure root cause, delivery conclusion.
- 3 escalation timings: at phase end, on immediate failure, at final handoff.
- After gate passes, write a short test-report summary to `docs/` and report through the §3.10 reporting channel.

### Step 2.6 — Completion definition (§3.15 tab ③)

Delivery counts as DONE only if ALL hold:

| Criterion | Threshold |
| --- | --- |
| P0 pass | 100% |
| P1 pass | 100% |
| P2 pass | ≥95% |
| Stability | 3 consecutive runs identical |
| Blocking defects | zero (any block on a P0 path = not shippable) |
| Evidence | case results + failure screenshots/logs kept |

---

## Quick Reference — one-line rules

- **交付之前不许说"完成"** — always run Gate 2 first.
- Session start → run Gate 1 (reload master plan).
- "接口先对齐、版本号必报、提交先看 status、上线必须 curl 验证、交付前必跑测试（P0/P1 100%、P2 ≥95%、连续3次稳定）、交接全靠文档落盘".
- If in doubt about anything (env, expected behavior, boundaries) → **ask the user, do not guess**.
- Exemptions in §3.15 tab ⑦ reduce the four-phase flow but NEVER remove §3.4 basic verification (syntax check, online curl confirm).

---

## Gate 3 — Trae Hook Equivalents (Session Sync & Edit Tracking) — ADDED 2026-10-09

Claude/CodeBuddy have `settings.json` hooks that auto-fire `claim_guard.py`, `edit_stats.py`, and `ev-report.js` on lifecycle events. Trae has no such mechanism. **This gate bridges the gap** by defining self-enforced equivalents using the **same shared scripts** from the `guomengtao/` repo — zero logic duplication, zero drift.

Shared scripts (single source of truth for all three tools):

| Script | Path | Hook event |
|---|---|---|
| claim guard | `tools/hooks/claim_guard.py` | PreToolUse |
| edit stats | `tools/hooks/edit_stats.py` | PostToolUse |
| ev-report | `ev/ev-ops-android/scripts/ev-report.js` | SessionStart / UserPromptSubmit / SessionEnd |

### Step 3.1 — 会话欢迎流程（4 步，每场新会话执行一次，Gate 1 之后执行）

**每场 Trae 新会话必须先完成 4 步欢迎流程，之后才能接任何用户任务。** 流程依次建立开发者身份、登记会话、报告今日统计、声明就绪。按顺序执行，不可跳步、不可乱序。

---

#### Step 3.1.1 — 花名（昵称）设置

AI 自行生成一个俏皮好记的花名，**必须包含至少 1 个 emoji 图标 + 2~8 字中文，emoji 位置不限**。示例：`🐶小铁锤`、`小铁锤🐶`、`🪑螺丝钉`、`☀️代码蚂蚁`、`闪电猫⚡`、`飞舞的蒲公英🌸`。整场会话不更改。花名即为所有钩子 payload 中的 `title` 字段。

**emoji 校验规则**：花名必须包含至少一个 emoji 字符（Unicode Emoji_Presentation 或 Extended_Pictographic）且中文 2~8 字。不含 emoji 或中文字数不合规的花名视为不合法，`ev-report.js` 将拒绝写入黑板和 Supabase 入库。

```
🔨 我是【🐶小铁锤】，本场会话由我为你干活。
```

---

#### Step 3.1.2 — 登记会话记录

调用 `ev-report.js start` 初始化会话黑板并在 Supabase 立案，EvOps App 端可见（tool=trae, title=花名）。

```bash
echo '{"session_id":"<trae-sid>","cwd":"/Users/Banner/Documents/guomengtao","hook_event_name":"SessionStart","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js start
```

产出：创建 `data/active/<sid>.json`（会话黑板）+ 注册 `_sidmap.json` 映射。

---

#### Step 3.1.2a — 强制显示 SDR（会话纪律记录）⭐ 2026-10-12 新增 · 三通道 §3.7

**`ev-report.js start` 执行后，必须立即读取黑板 JSON 并将 SDR 以表格形式打给用户。漏打即违规。**

1. 读取黑板 JSON：`ev/ev-ops-android/data/active/<sid>.json`
2. 提取以下字段并以表格形式展示：

| 字段 | 来源 | 说明 |
|------|------|------|
| 花名 | `.title` | 会话昵称 |
| SID | `.sid` | ev-report 标准化后的会话 ID |
| raw_sid | `.raw_sid` | AI 生成的原始 SID |
| 黑板文件 | 文件路径 | `data/active/<sid>.json` |
| 工具链 | `.tool` + model | 如 `trae-ide / deepseek-v4-pro` |
| 启动时间 | `.started_at` | 会话立案时间 |
| 任务 | `.tasks[]` | 已认领的任务单号列表（空 = 未领单） |

**输出格式**（必须原样打出，不可省略）：
```
📋 SDR（会话纪律记录）
| 花名 | <title> |
| SID  | <sid> |
| 黑板 | data/active/<sid>.json |
| 工具 | <tool> / <model> |
| 启动 | <started_at> |
| 任务 | <list or "无（未领单）"> |
```

> **此步骤为硬性要求，不可跳过**。如果黑板 JSON 不存在（`ev-report.js start` 失败），必须明确告知用户并标注 `⚠️ SDR 缺失`。

---

#### Step 3.1.3 — 今日统计报告

从 Supabase 聚合查询今日累积数据并报告：

| 统计项 | 含义 | 数据源 |
|---|---|---|
| 快速 | 无 evtask 单号的对话数 | 不关联 evtask 的 prompt |
| 任务内 | 有 evtask 单号的对话数 | 关联 evtask 的 prompt |
| 领单 | 今天注册的任务数 | `evops_tasks` |
| 完成 | 今天完成（昨 N） | `evops_tasks` |
| 进行 | 当前有单号的进行中任务（无单号 = 0）| `evops_tasks` |

```
💬 今日 10 轮 · 快速 3 / 任务内 7 ｜ 📥 领 6 · ✅ 完成 3（昨 5）· 🔵 进行 1（evtask-xxx 任务名）
```
> 进行 1 必须带真实完整的 evtask 单号（禁止截断 `…`，禁止自造）；没有领到单号或不确定完整单号则写 `🔵 进行 0`
>
> **⚠️ 先查再报（2026-10-09）**：报「进行」前必须先核实真实数据，禁止凭空写 0。核实来源优先级：
> 1. 读本会话黑板上报文件 `ev/ev-ops-android/data/active/<sid>.json`（`tasks[]` 里 `status=in_progress` 的 `id`）
> 2. 云端接口 `?action=task-list&status=in_progress`（同源 `listInProgress()`）
> 3. 两者都读不到才写 `🔵 进行 0`

> Supabase 不可达时跳过此步并给出警告，绝不阻塞会话。

---

#### Step 3.1.4 — 就绪声明

明确声明已就绪。这是 AI 初始化完成、可以接任务的信号。

```
✅ 准备就绪。告诉我干什么，我开工。
```

### Step 3.2 — PreToolUse claim guard (BEFORE every Write/Edit/MultiEdit)

```bash
echo '{"session_id":"<trae-sid>","hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"filePath":"<absolute-path>"},"cwd":"/Users/Banner/Documents/guomengtao"}' \
  | python3 tools/hooks/claim_guard.py
```

- **Exit 0 + no stdout** → file is claimed (or fast-lane), proceed with edit.
- **Stdout contains `permissionDecision: "deny"`** → STOP. Read `permissionDecisionReason`, complete the claim triple, retry edit.
- **Script crashes / non-zero exit** → fail-open: proceed, log the error. Never block work because of a hook error.

Failure to run this check before an edit = rule violation, same as editing without claiming.

### Step 3.3 — PostToolUse edit stats (AFTER every Write/Edit/MultiEdit)

```bash
echo '{"session_id":"<trae-sid>","tool_name":"Edit","tool_input":{"filePath":"<absolute-path>"},"tool_response":{"structuredPatch":[{"lines":["+added","-removed"," context"]}]},"cwd":"/Users/Banner/Documents/guomengtao"}' \
  | python3 tools/hooks/edit_stats.py
```

Accumulates adds/dels per file into the session blackboard. The next `ev-report.js prompt` sync pushes these stats to the cloud, making progress visible on the task dashboard.

### Step 3.4 — 每次收到用户消息：上报 + 汇报 + SDR（三通道强制 §3.7）

**每次收到用户消息，必须做三件事（缺一不可）：**

1. **调用 `ev-report.js prompt`** — 同步会话心跳 + 黑板数据到 Supabase。
2. **向用户当面汇报** — 告知已同步、当前状态。
3. **显示 SDR** — 将 `ev-report.js prompt` 吐出的 `📋 SDR` 表格（花名/SID/黑板/工具/启动/任务/上下文/体力/领取/健康）**原文附在本次答复末尾**。漏打即违规（三通道 §3.7）。

**汇报格式**（一行，用户可见）：
```
📨 已收到 · 会话【花名】· 任务 xxx · 第 N 轮
```

**SDR 显示要求**：每轮答复末尾必须包含 `ev-report.js` 钩子 stdout 输出的 `📋 SDR` 表格全部行。AI 不需要记忆 SDR 数据——钩子每轮自动吐到 stdout，只需**原文复述**。格式统一为表格（Step 3.1.2a = §3.7 通道1 = §3.7 通道2 输出）。

**同步命令**（fire-and-forget，不阻塞回复）：
```bash
echo '{"session_id":"<trae-sid>","prompt":"<user prompt, ≤80 chars>","cwd":"/Users/Banner/Documents/guomengtao","title":"<花名>","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js prompt
```

### Step 3.5 — SessionEnd (when session terminates)

```bash
echo '{"session_id":"<trae-sid>","cwd":"/Users/Banner/Documents/guomengtao","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js end
```

Marks the session closed. Also triggers the Mac end-notify modal (`~/.workbuddy/scripts/task-ping.sh`).

### Step 3.6 — session_id

The `<trae-sid>` is constructed as: `trae-YYYYMMDD-HHMM-<sha1-first-4>` using the same stable-sid algorithm as `ev-report.js`. On first use, read it from `_sidmap.json`; if not present, compute and use consistently for the whole session.

### Step 3.7 — SDR 三通道强制互锁（2026-10-12 新增）

SDR（会话纪律记录）通过三个独立通道相互强制、相互验证，任何一条通道缺失都会被另外两条检测到并告警。

---

#### 通道1 — 插件层（SKILL.md，即本文档）

**规则**：AI 每轮答复末尾**必须**附带完整 SDR（上下文%/对话/任务单/健康）。

- 依据：Step 3.1.2a（会话启动时强制显示）+ Step 3.4（每轮强制显示）
- 格式：由 `ev-report.js printSDR()` 输出 `📋 SDR` 表格（花名/SID/黑板/工具/启动/任务/上下文/体力/领取/健康），AI 原文复述
- 违规判定：漏打 SDR → 会话纪律违规，可在 EvOps 看板标记

---

#### 通道2 — MCP 钩子层（ev-report.js）

**规则**：`ev-report.js prompt` 每轮调用 `printSDR()` 吐出 SDR 数据到 stdout，同时写黑板跟踪。

- 数据吐到 stdout：AI 可直接读取并复述（通道1 的数据源）
- 黑板跟踪：每次 `printSDR()` 写 `_sdr_displayed_at`（时间戳）+ `_sdr_rounds`（累计轮次）到 `data/active/<sid>.json`
- 黑板字段随 `session-sync` 同步到 Supabase（通道3）
- 代码位置：[ev-report.js](file:///Users/Banner/Documents/guomengtao/ev/ev-ops-android/scripts/ev-report.js) `printSDR()` → `bb._sdr_displayed_at` / `bb._sdr_rounds`

---

#### 通道3 — Supabase 入库层

**规则**：`session-sync` 将黑板中的 SDR 字段（`sdr_displayed_at` + `sdr_rounds`）写入 `evops_sessions` 表。

- 字段来源：黑板 JSON → srow payload → `session-sync` API → Supabase upsert
- 看板消费：EvOps 大屏可读取 `sdr_displayed_at` / `sdr_rounds` 展示 SDR 合规状态
- 违规检测：`sdr_rounds === 0` 或 `sdr_displayed_at` 为空 → 标记「SDR 未显示」

---

#### 三通道互锁机制

```
通道1 (SKILL.md)  ←→  AI 每轮显示 SDR  ←→  通道2 (ev-report.js) 吐出数据
       ↑                                        ↓
       |          通道3 (Supabase) 入库验证       |
       └──────────  sdr_displayed_at ────────────┘
                  sdr_rounds 计数
```

- **通道1 缺失** → 通道2 stdout 有 SDR 但 AI 未复述 → 通道3 `sdr_rounds` 仍计数（因为是钩子吐的），但看板标记 AI 未复述
- **通道2 缺失** → 通道1 无数据源、通道3 无 `sdr_displayed_at` 更新 → 看板直接发现 SDR 断流
- **通道3 缺失** → 通道2 黑板有数据但 Supabase 无记录 → 下一次会话重连时差异可见

---

> **互锁原则**：三条通道缺一不可。每条通道既是数据生产者也是另外两条的校验者。任何单点故障都会被另外两条通道暴露。

### Fail-open discipline (same as Claude/CodeBuddy hooks)

All hook-equivalent scripts follow the same fail-open contract:
- Timeout: 10s for claim guard, 30s for ev-report
- Any error (network, missing file, syntax) → **log and continue**, never block
- `CLAIM_GUARD_MODE=log` env var makes claim guard log-only (never deny), useful for debugging