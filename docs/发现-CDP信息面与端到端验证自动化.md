# 发现：CDP 信息面远超当前用量 —— Input 域可点 DOM，端到端验证可自动化（尚未实测）

| 项 | 值 |
|----|----|
| 日期 | 2026-10-17 |
| 会话 | 按钮法医🔬（workbuddy-20261016-2116-2e5d） |
| 单号 | evtask-X-guomengtao-261017-rmvmf3 |
| 探测环境 | VS Code 1.142.0 · CDP 端口 9229 · MarsCode 聊天面板已打开 |
| 探测方式 | 自建探针 `/tmp/enum_probe.js`（双层 DOM 枚举）+ `/tmp/page_probe.js`（工作台可读性），全部走 `Runtime.evaluate`，只读 |
| 关联背景 | trae-hello-button v0.1.0（CDP 直注优先）发布后的能力面复盘 |

---

## 0. TL;DR

1. **不止一个 ID**：当前插件（`getChatTabFingerprint`）只取 2 个 ID，但同一个 `Runtime.evaluate` 通道里，聊天 webview 实测存在 **6 族 ID + 30 种 data-\* 语义属性**（293 个元素挂载）；
2. **工作台也可读**：CDP 9229 的 page 目标（VS Code 主工作台）可以正常 evaluate——这**更正了排查过程中早前的说法**（当时判断"只暴露 webview、VS Code UI 够不着"）；
3. **重点发现（尚未实测）**：既然工作台 DOM 可读，理论上 **CDP 的 Input 域就能派发鼠标事件去点击这些 DOM 元素——包括 hello 状态栏按钮本身**。这意味着 trae-hello-button 的**端到端验证可以全自动化**，不再需要人工 Reload Window + 手动点按钮。此条仅有理论推导与能力面证据，**未做实测**。

---

## 1. 基线：插件当前实际提取的信息

`cdp.js:258 getChatTabFingerprint` 的全部产出：

| 字段 | 来源 | 性质 |
|------|------|------|
| `urlSessionId` | webview URL 的 `?id=` 参数 | ID（UUID） |
| `dataSessionId` | iframe 内 `[data-session-id]` 属性 | ID（hex，即落 Supabase 的 data_sid） |
| `fingerprint` | 活动 tab 标签文本的 md5 | 派生值，非 ID |
| `mainPageId` | CDP 目标 id | 进程级临时值，重启即变 |

即：**4 个字段里只有 2 个是真正的 ID**，且插件只把 `dataSessionId` 用于 Supabase 落库。

---

## 2. 发现一：聊天 webview 的 ID 家族（实测数据）

探测目标：`vscode-webview://<hash>/index.html?id=b14717fa-eb70-43af-8695-…`。结构为顶层文档 + `#active-frame` 同源 iframe 两层；**所有信息集中在 iframe 层**（顶层 data-\* 为 0）。

iframe 内实测 **293 个元素带 data-\* 属性、30 种属性名**，其中 ID 家族：

| ID 族 | 实测样本值 | 数量 | 挂点 |
|-------|-----------|------|------|
| `data-sessionId` | `6ad1cd30297c826d75debde1` | 2 | `div.ai-chat` |
| `data-turnId` | `6ad2c2df7a733d827716da6a` | 4 | `div.turn` |
| `data-userMessageId` | `6ad2c2df7a733d827716da6a` | 4 | 用户消息节点 |
| `data-agentMessageId` | `6ad2c2df7a733d827716da6c` | 4 | AI 消息节点 |
| `data-messageId` | `6ad2c2df7a733d827716da6a` | 12 | 各消息节点 |
| `data-planItemId` | `6ad2c2e27a733d827716da73` | **43** | `div.agent-plan-item` |

一个会话下挂着**轮次 → 消息 → 计划项**三级 ID 树（turn → user/agent message → plan item），粒度远细于"一个 session id"。

**非 ID 的语义状态同样可读**：`data-role=user`（12）、`data-mode=code`（Agent 模式）、`data-itemType=turn:user-message`（124）、`data-toolcallType=finish`（43，工具调用记录）、`data-messageIndex=20`（序号）、`data-testid`（83，测试钩子）、主题三连（`data-vscodeThemeKind=vscode-dark`、`data-vscodeThemeName=Dark 2026`、`data-styledVersion=6.1.19`），以及消息正文本身（DOM textContent）。

**存储面很干净**：iframe 的 localStorage 只有一个键 `mcp_has_shown_guide`，sessionStorage 为空，无 cookie——聊天状态不在本地存储。

**注意虚拟滚动**：消息列表是 virtuoso 虚拟列表（`data-virtuosoScroller=true`），DOM 里只有**可见轮次**，任意时刻读到的是局部快照而非全量历史。

---

## 3. 发现二：两个 ID 命名空间，别混用

- URL 里的 `?id=b14717fa-eb70-43af-8695-…`（UUID）是 **webview 视图实例 id**，标识"这个聊天面板 webview"；
- DOM 里的 `data-sessionId=6ad1cd30297c826d75debde1`（hex）才是**聊天会话 id**。

二者不同命名空间、不同格式、不同生命周期。插件目前都收了，但只有后者进 Supabase。若未来做消息级操作（引用某轮对话），应使用 turn/message ID 家族，而非这两个。

---

## 4. 发现三：工作台 page 目标可读（对早前判断的勘误）

排查早期曾判断"9229 上只暴露 webview，VS Code 自身 UI 不是 CDP target、够不着"。**实测不准确**：`/json/list` 中的 page 目标（`vscode-file://vscode-app/…/electron-browser/index.html`）可以正常 `Runtime.evaluate`，实测读到：

- 当前编辑器标题（`project_rules.md: Original ↔ Trae's Changes … — Modified`）；
- **19 个状态栏项**，其文本里能直接看到 trae-hello-button 自己的 `data-sid: 6ad1cd30297c826d75debde1` 按钮，以及 evops.trae-session-plugin 的 `Input / Send / Hello` 按钮；
- 侧边栏、面板、终端 DOM 节点。

**推论**：data-sid 的获取其实有**第二条冗余通道**——不用进聊天 webview，直接读工作台状态栏里插件自己渲染的那段文本即可（chat 面板没打开时这条可能仍可用，未验证）。

---

## 5. 发现四（重点·尚未实测）：Input 域可点 DOM → 端到端验证可自动化

### 5.1 原理

CDP 的 Input 域（`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`）合成的是**浏览器原生输入事件**，与 v0.1.0 发信链路已实测验证的 `Input.insertText` 同属原生输入域。工作台的状态栏按钮是真实 DOM 元素（`.statusbar-item a`，不是 canvas 绘制）。两者结合：

```
定位按钮元素 → getBoundingClientRect 算坐标 → Input.dispatchMouseEvent(mousePressed/mouseReleased) → 按钮 onClick 触发
```

即：**CDP 可以"点击" hello 按钮**，把"点按钮 → 发信 → 聊天面板出现消息"整条链路在脚本里闭环。

### 5.2 验证设计（若后续实测，按此三步）

1. 记录聊天面板消息数 N（读 webview DOM 的消息节点）；
2. 对工作台 page 目标派发鼠标事件点击 hello 状态栏项；
3. 复读消息数，N→N+1 且末条为「你好」即端到端通过；同时 Supabase `ev_mcp_logs` 应新增一行。

### 5.3 不确定性与风险（为何标注"尚未实测"）

- **热区命中未知**：Monaco 状态栏虽为 DOM，但部分 UI 区域的实际点击热区与 `getBoundingClientRect` 是否一致，未验证；
- **事件序列未知**：VS Code 可能依赖特定的 `pointerdown → mouseup → click` 序列或 `detail` 参数，合成事件缺环可能不被 React 事件委托接收（本次发信链路里 `execCommand` 就栽在"API 返回成功但框架没收到"上）；
- **焦点副作用**：点击状态栏可能改变工作台焦点，进而影响聊天 webview 的渲染状态（虚拟滚动只渲染可见项，可能干扰第 3 步的复读）。

### 5.4 价值

一旦实测通过，trae-hello-button 的验收从"人工 Reload Window + 手动点按钮 + 肉眼看聊天面板"变为**一条脚本**，可纳入每次发版前的回归。v0.1.0 发布时遗留的"端到端未闭环"缺口（见《CDP直注成功经验与局限性.md》缺点清单第 9 条）可由此补齐。

---

## 6. 硬边界（做不到的）

| 边界 | 说明 |
|------|------|
| 跨域 iframe | 同源策略下 DOM 不可读；目前能穿透 `#active-frame` 靠的是 `vscode-webview://` 同源，上游改跨域即静默失效 |
| 虚拟滚动 | DOM 仅存可见轮次，读到的是局部快照 |
| worker target | 9229 上 2 个 worker（URL 为空）无可评估入口 |
| 扩展宿主进程 | Node 侧不在 CDP 管辖范围（CDP 管渲染层） |
| 端口依赖 | 整条链路依赖 9229 常开；VS Code 自动更新覆盖 wrapper 后静默降级 |

---

## 7. 安全含义

CDP 端口是**上帝模式**：本机任何能连上 9229 的进程，都能读走聊天内容、工作区文件名、状态栏文本，并能合成输入事件。当前插件只读一个 data-sid，是能力面的最小化使用。结论有两条：

1. 信息获取的上限远未触及——但**不应**因此把读取范围随意扩大（如把消息内容也落库）；
2. Input 域可点 DOM 这条能力，用在自动化验收上是利器，滥用则是远程操作面——**保持只读探测 + 明确目的的写入**是底线。

---

## 8. 建议动作（按性价比排序）

1. **实测发现四**：写 `e2e-click-probe` 脚本验证 CDP 点击 hello 按钮，通过后纳入发版回归清单；
2. 消息级 ID（turn/message/planItem）可按需接入，用于精确引用对话轮次；
3. 工作台状态栏文本作为 data-sid 的第二读取通道，作为聊天面板未打开时的兜底；
4. 维持现有最小化读取面，不扩大落库内容。

---

*本文档所有数据来自 2026-10-17 对运行中 VS Code 的只读实测；标注"尚未实测"的条目仅有理论推导，实施前需按 5.3 节逐项验证。*
