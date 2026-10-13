# 故障复盘：Trae CN 未加载 ev-mcp 的根因分析

> 故障时间：2026-10-13
> 现象：Trae CN 对话中 ev-mcp 的 7 个工具（ev_status / ev_add_task / ev_start / ev_done / ev_harvest / ev_log_message / ev_name_session）全部不可用。
> 修复：创建 `~/.trae-cn/mcp.json`
> 影响范围：ev-mcp 的 AI 任务记账功能在 Trae CN 中静默失效，所有对话无 SDR 记录、无任务登记。

---

## 一句话根因

**MCP 配置写在了 CodeBuddy 的路径（`~/.codebuddy/mcp.json`），但当前运行的 IDE 是 Trae CN，它只读自己的路径（`~/.trae-cn/mcp.json`）。两个 IDE 的配置不共享。**

---

## 一、故障时间线

```
之前某个时间点：
  用户在 CodeBuddy 中配置了 ev-mcp → ~/.codebuddy/mcp.json ✅
  ev-mcp 在 CodeBuddy 中正常工作。

之后某个时间点：
  用户切换到 Trae CN 使用。
  Trae CN 启动 → 读 ~/.trae-cn/mcp.json → 文件不存在 → 无 MCP 服务器加载。
  用户看到的现象：对话中没有任何 ev_* 工具可用，无 SDR 表格。

本次会话：
  【排查阶段】
  ① 首先怀疑配置路径不对 → 检查 ~/.codebuddy/mcp.json → 存在且正确 ✅
  ② 怀疑 ev-mcp 服务本身有问题 → 手动启动验证 → Supabase 连通、session 写入正常 ✅
  ③ 怀疑是 reload 问题 → 但仍无效 ❌
  ④ 终于意识到：运行的是 Trae CN，不是 CodeBuddy！
  
  【对比验证】
  ⑤ 查 ~/.trae-cn/ 目录结构 → 无 mcp.json
  ⑥ 查 ~/.trae-cn/installed-plugins.json → mcp_servers_json 为空
  ⑦ 查 ~/.trae-cn/mcps/ → 只有内置的 s_android-sdk 和 s_app-auth，无 evops
  ⑧ 查 ~/Library/Application Support/Trae CN/User/settings.json → 无 mcp key
  ⑨ 查 globalStorage/storage.json → 无 mcp 引用
  ⑩ 对比 CodeBuddy 配置路径规律：
       CodeBuddy → ~/.codebuddy/mcp.json
       Trae CN   → ~/.trae-cn/mcp.json  ← 这个文件不存在！
  
  【修复】
  ⑪ 创建 ~/.trae-cn/mcp.json，内容与 ~/.codebuddy/mcp.json 一致
  ⑫ 验证：json 格式合法、ev-mcp 服务可启动
  ⑬ Trae CN reload → ev_status 调用成功 → 返回真实任务数据 ✅
```

---

## 二、为什么排查走了弯路

### 弯路 1：误以为 IDE 是 CodeBuddy

本机同时安装了多个 AI IDE：

| IDE | 品牌 | MCP 配置路径 |
|---|---|---|
| CodeBuddy CN | 腾讯 | `~/.codebuddy/mcp.json` |
| **Trae CN** ← 实际运行的 | **字节跳动** | **`~/.trae-cn/mcp.json`** |
| Trae（国际版） | 字节跳动 | `~/.trae/mcp.json` |
| Claude Code | Anthropic | `~/.claude/mcp.json` 或 `settings.json` 中配置 |
| Cursor | Cursor | `.cursor/mcp.json` |

Trae CN 和 CodeBuddy CN 的界面风格有相似之处（都是 VSCode fork），容易搞混。排查初期一直在 `~/.codebuddy/` 路径下找问题，但那里配置完全正确——问题根本不在这。

### 弯路 2：ev-mcp 有三个 mcp.json，但没一个是 Trae CN 读的

本机实际存在三份 MCP 配置：

```
① ~/.codebuddy/mcp.json              ← CodeBuddy 读 ✅
② ev/ev-mcp/.trae/mcp.json           ← 项目级 Trae 配置（Trae 国际版读）
③ ~/.trae-cn/mcp.json               ← Trae CN 读 ← 这个不存在！❌
```

排查顺序是先找到 ① 发现正确，然后找到 ② 发现也存在，于是怀疑「是不是 reload 不够」或者「是不是 ev-mcp 服务挂了」。直到把 Trae CN 的目录结构全部翻一遍，才发现根本没有 ③。

### 弯路 3：Trae CN 的 VSCode 系目录结构具有迷惑性

Trae CN 是 VSCode fork，它的配置目录有两层：

```
~/.trae-cn/                              ← 用户级配置（命令行参数等）
~/Library/Application Support/Trae CN/   ← VSCode 风格的应用数据目录
    ├── User/settings.json               ← 编辑器设置
    ├── User/globalStorage/storage.json  ← 全局状态（SQLite dump）
    └── ...
```

初期在 `settings.json` 和 `storage.json` 里搜 `mcp` 关键字，结果都是空的。因为 Trae CN 的 MCP 配置既不走 VSCode settings，也不走 globalStorage——它走的是独立的 `~/.trae-cn/mcp.json` 文件，与 CodeBuddy 同模式。

---

## 三、技术细节：Trae CN 如何加载 MCP

基于排查过程中对 `~/.trae-cn/` 目录的完整扫描，总结如下：

### 3.1 MCP 配置的加载路径

```
Trae CN 启动
  │
  ├─ 读取 ~/.trae-cn/mcp.json           ← 用户自定义 MCP 服务器
  │   （格式：{ "mcpServers": { "name": { "command": ..., "args": [...] } } }）
  │
  ├─ 读取 ~/.trae-cn/installed-plugins.json   ← 插件级 MCP
  │   每个插件的 mcp_servers_json 字段
  │
  └─ 内置 MCP（自动生成）
       为每个打开的工作区自动生成 integrated_code_mode 和 mcp_Record___Replay
       存储在 ~/.trae-cn/mcps/s_<workspace_hash>/solo_agent/
```

### 3.2 配置格式

```json
{
  "mcpServers": {
    "evops": {
      "command": "node",
      "args": ["/Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js"]
    }
  }
}
```

与 CodeBuddy 的 `mcp.json` 格式完全相同——都是标准的 MCP 服务器配置格式。

### 3.3 为什么三层都没读到

| 配置层 | 状态 | 原因 |
|---|---|---|
| `~/.trae-cn/mcp.json` | ❌ 不存在 | 从未创建过 |
| `installed-plugins.json` | ❌ 空 | 没有插件提供 MCP 服务器 |
| 内置 MCP | ❌ 无关 | 只生成 integrated_code_mode 和 Record&Replay，不生成 evops |

---

## 四、为什么 CodeBuddy 和 Trae CN 不共享配置

两个 IDE 虽然都是 VSCode fork，但属于**不同公司、不同产品线**：

- **CodeBuddy CN**：腾讯出品，配置目录 `~/.codebuddy/`
- **Trae CN**：字节跳动出品，配置目录 `~/.trae-cn/`

它们不共享配置的原因：
1. 不同的产品团队，没有设计互读配置的机制
2. `mcp.json` 是 IDE 进程启动时读取的，不是系统级共享配置
3. 各自有独立的插件生态和安装目录

**结论**：每新增一个 AI IDE，就需要多维护一份 `mcp.json`。这不是 bug——是设计如此。

---

## 五、修复方案

### 已执行

创建 `~/.trae-cn/mcp.json`，内容与 `~/.codebuddy/mcp.json` 一致：

```json
{
  "mcpServers": {
    "evops": {
      "command": "node",
      "args": ["/Users/Banner/Documents/guomengtao/ev/ev-mcp/index.js"]
    }
  }
}
```

### 长期建议

如果以后还换了别的 IDE（Cursor、Windsurf 等），需要按各自路径补充配置：

| IDE | MCP 配置路径 |
|---|---|
| CodeBuddy CN | `~/.codebuddy/mcp.json` |
| Trae CN | `~/.trae-cn/mcp.json` |
| Trae（国际版） | `~/.trae/mcp.json` |
| Claude Code | `~/.claude/mcp.json` 或 `~/.claude/settings.json` |
| Cursor | `.cursor/mcp.json`（项目根目录） |

可以考虑在 ev-mcp 的 README 里维护一个**多 IDE 配置速查表**，避免下次再踩同一个坑。

---

## 六、教训

1. **先确认你在哪个 IDE 里**——CodeBuddy 和 Trae CN 长得很像，但配置文件路径完全不同。
2. **MCP 配置不跨 IDE 共享**——这是正常的，不是 bug。每个 IDE 有自己的配置目录。
3. **排查「工具不可用」的检查顺序**：
   - ① 确认当前 IDE → 找到对应配置路径
   - ② 检查 `mcp.json` 是否存在且格式正确
   - ③ 手动启动 MCP 服务验证功能正常
   - ④ `reload window` 后检查工具是否出现
4. **不要一上来就怀疑服务挂了**——在这个案例里，ev-mcp 始终正常工作，只是 Trae CN 不知道它的存在。