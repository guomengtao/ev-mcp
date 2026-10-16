'use strict';
// ev-cred.js — 凭据解析（方案B：不再读兄弟目录 ../xxx/.env）
// 优先级：环境变量 > 本仓库 .env > ~/.config/ev/credentials.json
// 铁律：关键凭据缺失一律 fail-fast 抛错，绝不返回空串造成"静默降级"。
const fs = require('fs');
const path = require('path');
const P = require('./ev-paths.js');

function parseEnvFile(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const out = {};
    txt.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    });
    return out;
  } catch (e) { return {}; }
}

function fromRepoDotEnv(rootDir) {
  const f = path.join(rootDir || P.repoRoot(), '.env');
  if (!fs.existsSync(f)) return null;
  const d = parseEnvFile(f);
  const url = d.SUPABASE_URL || d.EV_MCP_SUPABASE_URL || '';
  const key = d.SUPABASE_SERVICE_ROLE_KEY || d.EV_MCP_SUPABASE_KEY || '';
  return (url && key) ? { url, key, source: f } : null;
}

function fromGlobalCred() {
  const f = path.join(P.home(), '.config', 'ev', 'credentials.json');
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const url = j.SUPABASE_URL || j.EV_MCP_SUPABASE_URL || '';
    const key = j.SUPABASE_SERVICE_ROLE_KEY || j.EV_MCP_SUPABASE_KEY || '';
    return (url && key) ? { url, key, source: f } : null;
  } catch (e) { return null; }
}

/**
 * 取 Supabase 凭据。rootDir 可显式指定仓库根（供脚本传入自己的 __dirname 上溯结果）。
 * @throws 三处都没有时抛错，提示可执行动作
 */
function supabase(rootDir) {
  const eu = process.env.EV_MCP_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const ek = process.env.EV_MCP_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (eu && ek) return { url: eu, key: ek, source: 'env' };
  const a = fromRepoDotEnv(rootDir); if (a) return a;
  const b = fromGlobalCred(); if (b) return b;
  throw new Error('[ev-cred] 缺少 Supabase 凭据：请 `cp .env.example .env` 并填写，' +
    '或设置环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

/** 同步令牌：非致命，缺失返回空串（调用方自行降级） */
function syncToken(rootDir) {
  if (process.env.EV_SYNC_TOKEN) return process.env.EV_SYNC_TOKEN;
  const d = parseEnvFile(path.join(rootDir || P.repoRoot(), '.env'));
  return d.EV_SYNC_TOKEN || '';
}

module.exports = { supabase, syncToken, parseEnvFile };
