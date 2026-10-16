'use strict';
// ev-paths.js — 可移植路径解析（方案B：消灭一切用户名级硬编码）
// 铁律：本文件内不得出现 /Users/<某人> 形式的字面量；缺失即 fail-fast，不静默兜底。
const path = require('path');
const { execFileSync } = require('child_process');

/** 用户主目录。取不到就抛错——绝不回退到某个写死的用户名。 */
function home() {
  const h = process.env.HOME || process.env.USERPROFILE || '';
  if (!h) throw new Error('[ev-paths] 无法确定 HOME：请设置 HOME 环境变量');
  return h;
}

/**
 * 仓库根：EV_ROOT > git rev-parse --show-toplevel > __dirname 上溯
 * @param {string} [fromDir] 探测起点，缺省为 lib/ 的上两级（即仓库根）
 */
function repoRoot(fromDir) {
  if (process.env.EV_ROOT) return process.env.EV_ROOT;
  const start = fromDir || path.resolve(__dirname, '..', '..');
  try {
    const out = execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'],
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
    if (out) return out;
  } catch (e) { /* 非 git 环境：退回 start */ }
  return start;
}

/** 会话归档空间（退休俱乐部）：EV_RETIRE_SPACE > $HOME/WorkBuddy/退休俱乐部 */
function retireSpace() {
  return process.env.EV_RETIRE_SPACE || path.join(home(), 'WorkBuddy', '退休俱乐部');
}

module.exports = { home, repoRoot, retireSpace };
