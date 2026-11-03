---
name: "session-discipline"
description: "Fast-boot session init + delivery-before testing gate per the dev master plan (多人多AI统一协调开发总纲 §3.9/§3.15). Invoke at the START of every session before doing any task, and RE-INVOKE before delivering any completed work to the user. Session init runs in background, never blocks user interaction."
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

### Step 3.1 — 会话快速启动（Fast Boot）— REWRITTEN 2026-10-22

**核心理念：先回用户，后台初始化。用户第一句话必须秒回，所有会话登记走后台异步，绝不阻塞用户交互。**

---

#### Step 3.1.1 — 后台初始化（fire-and-forget，不阻塞回复）

收到用户首条消息后，**并行做三件事**，缺一不可：

**(A) 立刻回答用户** —— 不等待任何初始化完成。如果首条消息是打招呼，直接回复问候；如果是任务，直接开始分析。

**(B) Gate 1 轻量检查（必须，< 50ms）** —— 和回复用户**同时**进行，不等待结果：

```bash
stat -f "%Sm" -t "%Y-%m-%d %H:%M" ~/Documents/guomengtao/多人多AI统一协调开发总纲.md
```

mtime 记下来，在第二轮回复时按需重读变更章节。此命令极轻量（纯本地 stat），不构成阻塞。

**(C) 后台登记会话（必须）** —— 以 `blocking=false` + `wait_ms_before_async=0` 运行 `ev-report.js start`：

```bash
echo '{"session_id":"<trae-sid>","cwd":"/Users/Banner/Documents/guomengtao","hook_event_name":"SessionStart","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js start
```

- 花名（title）：后台自动生成，不在首轮回复中展示。默认使用简短标识如 `trae-<timestamp>`。
- 会话登记成功/失败均不阻塞用户交互。失败在下一轮用 `CheckCommandStatus` 检查后静默告知。
- SID 由 `ev-report.js` 自动生成，格式 `trae-YYYYMMDD-HHMM-<hash4>`，无需在首轮回复中展示。

> **硬底限**：(A)(B)(C) 三者必须全部执行。(B)(C) 和 (A) 同时发起、不等待结果。只回复用户而不做 (B)(C) = 违规。等 (B)(C) 完成才回复 = 过度阻塞。

---

#### Step 3.1.2 — 首轮之后的收尾汇报（可选）

后台初始化完成后，在**第二轮到第三轮之间**的某次回复末尾，可以简短附上报一次初始化确认（非强制）：

```
🟢 会话已登记 · sid=trae-YYYYMMDD-HHMM-xxxx
```

不需要花名、不需要 SDR 表格、不需要统计报告。简洁为上。

> Supabase 不可达时静默跳过，绝不阻塞会话。

---

#### Step 3.1.3 — 禁止事项

- ❌ 不要在首轮回复中打印花名、SDR 表格、统计报告
- ❌ 不要等 `ev-report.js start` 或 `stat` 返回结果才回复用户
- ❌ 不要跳过 (B) Gate 1 检查或 (C) 后台登记——只回复用户是违规
- ✅ 非阻塞 IO（stat、后台 RunCommand）必须做，和回复用户同时发起
- ✅ 如果用户首条消息是纯打招呼（你好/hi/hello），一行回复即可，不需要额外的就绪声明

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

### Step 3.4 — 每次收到用户消息：后台同步心跳（fire-and-forget）

**每次收到用户消息，只做一件事：后台同步心跳。**

调用 `ev-report.js prompt`（后台异步，不阻塞回复）：

```bash
echo '{"session_id":"<trae-sid>","prompt":"<user prompt, ≤80 chars>","cwd":"/Users/Banner/Documents/guomengtao","title":"trae-<timestamp>","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js prompt
```

- fire-and-forget，不阻塞回复，不等返回结果
- 不需要向用户汇报"已收到"或"SDR"
- SDR 数据由 `ev-report.js` 自动写入黑板并同步到 Supabase，AI 不需要展示
- 失败静默，绝不阻塞主流程

### Step 3.5 — SessionEnd (when session terminates)

```bash
echo '{"session_id":"<trae-sid>","cwd":"/Users/Banner/Documents/guomengtao","model":"deepseek-v4-pro","client":"trae-ide","version":"1.0"}' \
  | EV_TOOL=trae /usr/bin/env node ev/ev-ops-android/scripts/ev-report.js end
```

Marks the session closed. Also triggers the Mac end-notify modal (`~/.workbuddy/scripts/task-ping.sh`).

### Step 3.6 — session_id

The `<trae-sid>` is constructed as: `trae-YYYYMMDD-HHMM-<sha1-first-4>` using the same stable-sid algorithm as `ev-report.js`. On first use, read it from `_sidmap.json`; if not present, compute and use consistently for the whole session.

### Step 3.7 — SDR 后台同步机制（简化为双通道）— REWRITTEN 2026-10-22

SDR（会话纪律记录）数据由 `ev-report.js` 自动维护，不再要求 AI 在回复中展示。

---

#### 通道1 — 钩子层（ev-report.js）

**规则**：`ev-report.js prompt` 每轮自动调用 `printSDR()` 写入黑板跟踪。

- 黑板跟踪：每次 `printSDR()` 写 `_sdr_displayed_at`（时间戳）+ `_sdr_rounds`（累计轮次）到 `data/active/<sid>.json`
- 黑板字段随 `session-sync` 同步到 Supabase（通道2）
- 代码位置：[ev-report.js](file:///Users/Banner/Documents/guomengtao/ev/ev-ops-android/scripts/ev-report.js) `printSDR()` → `bb._sdr_displayed_at` / `bb._sdr_rounds`

---

#### 通道2 — Supabase 入库层

**规则**：`session-sync` 将黑板中的 SDR 字段（`sdr_displayed_at` + `sdr_rounds`）写入 `evops_sessions` 表。

- 字段来源：黑板 JSON → srow payload → `session-sync` API → Supabase upsert
- 看板消费：EvOps 大屏可读取 `sdr_displayed_at` / `sdr_rounds` 展示会话活跃状态

> **简化原则**：AI 不再需要在回复中展示 SDR。数据由钩子自动维护、Supabase 自动入库。两条通道足够覆盖所有监控需求。

### Fail-open discipline (same as Claude/CodeBuddy hooks)

All hook-equivalent scripts follow the same fail-open contract:
- Timeout: 10s for claim guard, 30s for ev-report
- Any error (network, missing file, syntax) → **log and continue**, never block
- `CLAIM_GUARD_MODE=log` env var makes claim guard log-only (never deny), useful for debugging