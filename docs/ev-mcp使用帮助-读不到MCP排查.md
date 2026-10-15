# ev-mcp 使用帮助 & 「读不到 MCP」排查指南

> 编写：2026-10-13 · 依据源码 `index.js`（版本 0.2.0）实测核写
> 用途：回答「这个 MCP 有哪些功能、怎么用」以及「为什么 AI 调不到 ev-mcp、怎么办」

---

## 一、这个 MCP 是干嘛的

`ev-mcp` 是一个 **AI 对话任务管理 / 会话纪律（SDR）日志服务**，采用 **Supabase 纯线上**存储（`ev_mcp_tasks` / `ev_mcp_logs` / `ev_mcp_sessions` 三张表）。

- **数据全在 Supabase**，无本地降级存储；Supabase 不通 = 服务不可用，不降级。
- 通过 **stdio**（标准输入输出）与宿主 AI 客户端（如 Trae）通信，由 `node index.js` 拉起。

它由以下**7 个工具**组成：

| 工具 | 作用 | 关键约束 |
| --- | --- | --- |
| `ev_status` | 读取任务状态并输出 SDR 表格 | 无门禁，随时可调 |
| `ev_add_task` | 登记新任务，返回单号 | **需花名** |
| `ev_start` | 领取/开始任务（open → doing） | **需花名**，仅 open 可开始 |
| `ev_done` | 标记任务完成 | **需花名** |
| `ev_harvest` | 收割所有 done 任务 → harvested | **需花名** |
| `ev_log_message` | 记录对话日志到 ev_mcp_logs | **需花名**；有进行中任务时强制传 task_id |
| `ev_name_session` | 给会话起花名（≤8 汉字含 1 emoji） | 无门禁；同名会被拒绝 |

---

## 二、花名门禁（最重要规则，先看这个）

> 源码里，除 `ev_status` 和 `ev_name_session` 之外，**其余所有工具在未设置花名前都会被拒绝**，返回：
> `🚫 尚未设置花名！必须自己起名……请立即调用 ev_name_session 自己起一个名字`

- **花名由 AI 自己起，不能问用户**（≤8 汉字，含 1 个 emoji，如 🐘象往）。
- 同一项目内花名**不能重复**（查 Supabase 校验，重复会拒绝）。
- 起名：`ev_name_session` → name 填花名。

---

## 三、各功能怎么用

### 3.1 每个对话开头：ev_status
每轮对话开始时应先调用，拿到 SDR 表格贴回回复末尾。无需参数。

```
ev_status()
```
输出示例（SID 每次会话一个）：
```
📋 SDR（会话纪律记录）
| 花名 | ❓未命名 | SID | SZTS-XXXX |
| 对话 | 1 轮 | 任务 | 领12 · 进行中1 · 完成7 |
| 待收割 | 0 | 阻塞 | 0 |
```

### 3.2 登记新任务：ev_add_task
参数：`title`（标题）+ `description`（描述，**不少于 50 字**）。
自动生成单号，格式 `evm-{工具}-{项目}-{日期}-{时分}-{随机}`。

```
ev_add_task(title="修复登录页", description="……不少于50字的描述……")
```

### 3.3 领取/开始：ev_start
参数：`id`（单号）。仅 `open` 状态的任务可开始，否则报错。

```
ev_start(id="evm-trae-ev-mcp-261013-0736-d942")
```

### 3.4 标记完成：ev_done
参数：`id`。把 `doing` 任务置为 `done`。

```
ev_done(id="evm-...")
```

### 3.5 收割：ev_harvest
无参数。把所有 `done` 任务转为 `harvested`（结算完成）。

```
ev_harvest()
```

### 3.6 记录对话日志：ev_log_message
参数：`role`（user/assistant/system，必填）、`content`（必填）、`task_id`（可选）、`session_id`、`tool_name`。
**若存在进行中的任务，必须传入属于进行中的 `task_id`**，否则拒绝。

```
ev_log_message(role="assistant", content="……", task_id="evm-...")
```

### 3.7 起花名：ev_name_session
```
ev_name_session(name="🔨小铁锤")
```

---

## 四、加载成功 vs 可用的三个层次

**结论：只有「能真正调用某个工具并拿到数据」才算完全可用。**

| 层次 | 表现 | 说明 |
| --- | --- | --- |
| ① 配置被发现 | `.trae/mcp.json` 里有 `ev-mcp` | 放错路径就不会被读到 |
| ② 进程被拉起 | `node index.js` 启动、MCP 握手完成 | 报错 = 起不来 |
| ③ 工具可用 | 调用 `ev_status` 返回 SDR | **判定是否可用的最终标准** |

---

## 五、读不到 MCP 怎么办（排查清单）

按从 `① → ③` 顺序自检，哪一层断就在哪一层修。

### 5.0 第一步：确认「读不到」的形态
先分清是「AI 说找不到 ev-mcp」还是「找到但调用报错」：
- **找不到/列表里没有 ev-mcp** → 卡在 ① 或 ②（配置/进程）
- **列表里有但调用报错** → 卡在 ③（通常是代码、Supabase、花名门禁）

### 5.1 配置没被读到（层次 ①）
- **检查配置文件路径**：Trae 读项目根目录的 `.trae/mcp.json`（或全局设置里的 MCP）。确认你的 JSON 放在正确位置。
- **确认工作区**：MCP 按工作区加载。从 `Downloads/10pro` 打开不会加载 `guomengtao` 项目下配的 MCP；要切到有 `.trae/mcp.json` 的目录（需在 `guomengtao/ev` 或对应项目根）。
- **改配置/重装后重载**：`Cmd+Shift+P` → `Developer: Reload Window`。

### 5.2 进程起不来（层次 ②）
- **Node 版本**：要求 Node 18+（用了原生 `fetch`）。终端跑 `node -v`。
- **手测能否启动**：终端直接跑 `node /Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js`，看是否有 `[ev-mcp]` 启动日志或语法报错。
- 若报错，多半是 `.env` 缺失或依赖问题，按 5.3 处理。

### 5.3 Supabase 配置缺失/表不存在（导致服务「已启但不可用」）
源码 `init()` 里：
- `.env` 未配 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → 启动打：
  `[ev-mcp] ⚠ SUPABASE_URL/KEY 未配置，服务不可用`
- 配了但表不存在/网络不通 → 打：
  `[ev-mcp] Supabase unreachable (table may not exist)`，并提示确认 `ev_mcp_tasks` 表存在。

**处理**：在 `ev-mcp` 目录放 `.env`，填写：
```
SUPABASE_URL=<你的项目URL>
SUPABASE_SERVICE_ROLE_KEY=<你的service_role key>
```
确认 Supabase 项目里有 `ev_mcp_tasks` / `ev_mcp_logs` / `ev_mcp_sessions` 三张表。

### 5.4 花名门禁挡路（层次 ③·最常见假故障）
未起花名时，`ev_add_task` 等会返回「🚫 尚未设置花名」。**这不是坏了，是门禁**。解决办法：先调一次 `ev_name_session` 起名。

### 5.5 看日志定位
切到 Trae **输出/日志面板**，筛选 MCP 通道，找 `[ev-mcp]` 开头的行——它把关键状态都打到 stderr 了：
- `会话已写入 Supabase ev_mcp_sessions` → 正常
- `会话 Supabase 写入失败: ...` → 写会话表失败
- `Supabase connected: <URL> | project: ...` → 已连上
- `服务不可用` → 按 5.3 处理

---

## 六、一句话速查

```
读不到 → 查工作区/配置路径（①）
进程起不来 → node -v + 手跑 index.js（②）
能启但工具报错 → 看 [ev-mcp] 日志；未配 .env / 表不存在（③）
工具说要花名 → ev_name_session 起名（门禁，非故障）
能调出 SDR → 完全可用 ✅
```

> 配套资源：本文件位于项目 `docs/`，与总纲 §3.5/§3.18「文档写进 guomengtao 项目目录」保持一致；MCP 配置样例见用户 `.trae/mcp.json`。