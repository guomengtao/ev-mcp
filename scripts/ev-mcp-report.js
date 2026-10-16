#!/usr/bin/env node
/**
 * ev-mcp-report.js —— ev-mcp 独立入库链路（补「路径B」）
 *
 * 背景：ev-mcp/对话入库流程分析.md 描述的「路径B：ev-report.js 钩子 → logPromptToMcp() → ev_mcp_logs」
 *       在代码中从未实现（全仓 grep logPromptToMcp 零命中），导致用户 prompt 长期缺失于 ev_mcp_logs。
 *       本脚本即为该路径的正式实现，由共享侧钩子以 spawn 方式调用（互不 require，保持隔离）。
 *
 * 用法：node ev-mcp-report.js prompt "<文本内容>" [会话sid]
 *   或：EV_PROMPT_TEXT="..." node ev-mcp-report.js prompt
 *
 * 设计（详见 guomengtao/docs/ev-mcp-report-入库链路-方案.md）：
 *   写表   ev_mcp_logs，role=user，tool_name='ev-mcp-report'（与路径A ev_log_message 区分）
 *   session_id 留 null —— ev-mcp 会话ID(S+PID36+时间戳36) 与 workbuddy sid 是两套体系，不互通；
 *                         来源身份改记 client_name='workbuddy:<sid>'
 *   去重   request_id = 'wbr-<sid>-<content sha1 前12位>'，插入前先查，命中即跳过（L2 软去重）
 *   失败   一律 fail-open：打印告警后 exit 0，绝不影响调用方（钩子主链路 evops_* 不受影响）
 *
 * 可移植：禁止任何 /Users/<某人> 字面量；凭据走 lib/ev-cred.js（env > 本仓 .env > ~/.config/ev/credentials.json）
 * 2026-10-16 · evtask-D-sersannerork-261016-v2fe2d
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const EV_CRED = require('./lib/ev-cred.js');
const ROOT = path.resolve(__dirname, '..');

const PROJECT = (process.env.EV_PROJECT || 'banner').toLowerCase();
const TOOL_NAME = 'ev-mcp-report';
const CONTENT_LIMIT = 2000;

/** fail-open：只告警、不抛错、exit 0，保证调用方（钩子）永不因此阻塞 */
function failOpen(msg) {
  console.error('[ev-mcp-report] ' + msg);
  process.exit(0);
}

function curlJson(method, urlPath, headers, body) {
  const args = ['-sS', '-m', '5', '-X', method, ROOT_CRED.url + urlPath];
  for (const k of Object.keys(headers)) args.push('-H', k + ': ' + headers[k]);
  if (body !== undefined) {
    args.push('-H', 'Prefer: return=minimal');
    args.push('-d', JSON.stringify(body));
  }
  const out = execFileSync('curl', args, { encoding: 'utf8', timeout: 8000 });
  if (!out) return null;
  try { return JSON.parse(out); } catch (e) { return null; }
}

// ---- 入参 ----
const mode = process.argv[2] || 'prompt';
const text = String(process.argv[3] || process.env.EV_PROMPT_TEXT || '').trim();
if (mode !== 'prompt') failOpen('仅支持 prompt 模式，收到：' + mode);
if (!text) failOpen('空内容，跳过写入（ev_mcp_logs.content 为 NOT NULL）');

let ROOT_CRED;
try {
  ROOT_CRED = EV_CRED.supabase(ROOT);
} catch (e) {
  failOpen(e.message);
}

const sid = process.argv[4] || process.env.CODEBUDDY_SESSION_ID || process.env.EV_SESSION_SID || 'unknown';
const requestId = 'wbr-' + sid + '-' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
const content = text.slice(0, CONTENT_LIMIT);

const H = {
  apikey: ROOT_CRED.key,
  Authorization: 'Bearer ' + ROOT_CRED.key,
  'Content-Type': 'application/json',
};

try {
  // —— L2 软去重：同 request_id 已存在则跳过 ——
  const dup = curlJson('GET',
    '/rest/v1/ev_mcp_logs?request_id=eq.' + encodeURIComponent(requestId) + '&select=id&limit=1', H);
  if (Array.isArray(dup) && dup.length > 0) {
    console.log('[ev-mcp-report] ⏭ 去重跳过 request_id=' + requestId);
    process.exit(0);
  }

  // —— task_id：取当前 doing 中的首条（失败降级 null，不阻断写入）——
  let taskId = null;
  try {
    const t = curlJson('GET',
      '/rest/v1/ev_mcp_tasks?status=eq.doing&select=id&order=created_at.desc&limit=1', H);
    if (Array.isArray(t) && t.length > 0) taskId = t[0].id;
  } catch (e) { /* 降级 null */ }

  const row = {
    project: PROJECT,
    role: 'user',
    content: content,
    session_id: null,                 // 两套会话体系不互通，见文件头说明
    task_id: taskId,
    tool_name: TOOL_NAME,
    duration_ms: null,
    request_id: requestId,
    status: 'ok',
    client_name: 'workbuddy:' + sid,
    created_at: new Date().toISOString(),
  };

  const res = execFileSync('curl', [
    '-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}',
    '-X', 'POST', ROOT_CRED.url + '/rest/v1/ev_mcp_logs',
    '-H', 'apikey: ' + ROOT_CRED.key,
    '-H', 'Authorization: Bearer ' + ROOT_CRED.key,
    '-H', 'Content-Type: application/json',
    '-H', 'Prefer: return=minimal',
    '-d', JSON.stringify(row),
  ], { encoding: 'utf8', timeout: 8000 });

  if (String(res).trim() !== '201' && String(res).trim() !== '200') {
    failOpen('写入失败 HTTP ' + String(res).trim() + '（本条未入库，主链路不受影响）');
  }
  console.log('[ev-mcp-report] ✅ 已入库 request_id=' + requestId +
    ' task=' + (taskId || '-') + ' len=' + content.length + ' project=' + PROJECT);
} catch (e) {
  failOpen('异常：' + (e && e.message ? e.message : String(e)));
}
