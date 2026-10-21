# 项目规则（Trae IDE 会话自动加载）

> Trae 会话每次启动会读取本文件。变更生效于下一轮对话。
> 关联：`多人多AI统一协调开发总纲.md`（公共开发规定 + 指针）

---

## §A ev-commit.sh 提交经验：用 `-F 文件` 代替 `-m 长中文`

### 背景

Trae 的 `RunCommand` 工具在终端通道执行命令时，Shell（zsh）在一个长期 PTY 会话中运行。以下情况会导致命令被错误解析或落盘失效：

- **长中文参数被引号拆断**：多行中文字符经 PTY 传递时，引号/换行会错误地将 `-m "第一行\n第二行\n..."` 切成若干散命令（zsh 逐行 `fg: no job control`），出现 `command not found: 运行时仓外副本已同步真源` 或 `env: 注入: No such file or directory` 等误执行风险。
- **命令输出/落盘不可靠**：`> 文件.txt` 重定向偶尔不落盘（`File does not exist`），write/read 工具通道稳定。
- **命令退出码不可信**：`exit 0` 可能是命令进程退出，而非 commit 真正落地（需事后读 `.git/logs/HEAD` 确证）。

### 稳策：commit 消息写入文件，用 `-F` 传递

#### 步骤

1. 把完整的 commit 消息（title + body + `Ev-<单号>` trailer）**用 Write 工具写入消息临时文件**（走可靠文件通道），例如：

   ```
   _commit_msg.txt 内容：
   
   feat(xxx): 一句话标题
   
   详细 body，中文、多行、无引号拆断风险。
   
   Ev-evtask-D-xxx-261019-xxxx: 标题
   ```

2. 单行跑（**命令行不带中文，所有消息来自文件**）：

   ```bash
   cd /path/to/repo && git add 文件 && \
     EV_SESSION_NAME="🐜花名" EV_SESSION_SID="evm-trae-xxx" \
     ~/.workbuddy/scripts/ev-commit.sh -F _commit_msg.txt; echo "RC=$?"
   ```

3. `ev-commit.sh` 底层 `exec git commit "$@"` 透传 `-F` 参数给原生 `git commit`，读取文件内容作为提交消息。花名/归因注入走 env 不变。

4. 用 **Read 工具直接读 `.git/refs/heads/main` + `.git/logs/HEAD`** 确证 HEAD 推进与 author 正确（绕过命令回读不可靠）。

5. 提交成功后删除临时文件：`rm -f _commit_msg.txt`

#### 稳策 checklist

- ✅ 消息临时文件由 Write 工具落盘（可靠通道）
- ✅ 命令行仅 ASCII + env 变量，零中文字符、零多行文字
- ✅ 事后从 `.git/refs/heads/main` + `.git/logs/HEAD` 读回确证（可靠通道）
- ✅ commit 成功后 `rm -f` 清理临时文件
- ⚠️ 不要用 `echo "..." > file` 创建消息文件（命令通道不可靠）
- ⚠️ 不要用命令重定向 `>` 做结果落盘验证（偶尔丢文件）

#### 已知局限

Trae 环境命令通道无法 token-reliably 输出——后台 direnv hook 向 PTY 持续输出 ANSI 转义序列，与命令输出混入同一缓冲区（详见 `docs/Trae终端输出异常分析.md`）。**结论：文件操作用 Write/Read/Edit 工具，命令仅做 git 操作，结果从 `.git/` 落盘物通过 Read 工具读回验证。**

---

## §B Trae 会话提交操作速查

| 操作 | 命令/工具 | 注意事项 |
|------|----------|---------|
| 写入改动 | Edit / Write 工具 | 可靠 |
| git add | `RunCommand: git add 文件` | 可靠，index 会落盘 |
| git commit | `RunCommand: ev-commit.sh -F 消息文件` | **消息必须入文件，零中文在命令行** |
| 验证 commit 是否落地 | `Read` 工具读 `.git/logs/HEAD` | 可靠，不依赖命令回读 |
| 读 git 状态 | `Read` 工具读 `.git/refs/heads/main` / `COMMIT_EDITMSG` | 可靠 |
| 删除临时文件 | `RunCommand: rm -f 文件` 或 DeleteFile 工具 | 可靠 |
| 写新文件 | Write 工具 | 可靠 |
| 读文件 | Read 工具 | 可靠 |

---

## §C 变更日志

| 时间 | 来源 | 摘要 |
|------|------|------|
| 2026-10-19 11:2x | `ev-session-author.sh` 治本改造 + `be7db36` 提交 | **§A 录入 `ev-commit.sh -F` 稳策**：经 3 轮失败（掩码 commit 门禁、claim 门禁、长中文引号拆断）后成功提交的完整步骤，纳入项目规则供后续复用 |