-- ev-mcp Supabase 建表 SQL（深度切割 v2：完全独立于云端，统一 ev_mcp_ 前缀）
-- 在 Supabase Dashboard → SQL Editor 中执行
-- 说明：本套表与云端 ev_sessions/evops_tasks/conversation_logs 完全隔离，零共用。

-- 1. 会话表：记录每次 MCP 启动的会话
CREATE TABLE IF NOT EXISTS ev_mcp_sessions (
  id         TEXT PRIMARY KEY,              -- 会话唯一ID，如 S2AB-3FQ7X (PID+时间戳)
  project    TEXT NOT NULL,                 -- 项目名
  name       TEXT,                          -- 花名，如 🦊狐步 (AI起名，≤8汉字+1emoji)
  pid        INTEGER,                       -- 进程PID
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 花名 + 项目 联合唯一（防止同一项目会话花名重复）
ALTER TABLE ev_mcp_sessions ADD CONSTRAINT ev_mcp_sessions_project_name_unique UNIQUE (project, name);

-- 2. 对话日志表（MCP 专属）
CREATE TABLE IF NOT EXISTS ev_mcp_logs (
  id          BIGSERIAL PRIMARY KEY,
  project     TEXT NOT NULL,
  role        TEXT NOT NULL,                 -- user / assistant / system
  content     TEXT NOT NULL,
  session_id  TEXT,                          -- 关联 ev_mcp_sessions.id
  task_id     TEXT,                          -- 任务单号，如 EV-0001；进行中任务期间必传
  tool_name   TEXT,                          -- 产生该日志的工具名，如 ev_status
  duration_ms INTEGER,                       -- 该次工具调用耗时（毫秒）
  request_id  TEXT,                          -- MCP 协议请求 ID（去重/追踪）
  status      TEXT DEFAULT 'ok',             -- ok / error
  client_name TEXT DEFAULT '',               -- 客户端名称（Trae/Claude 等），initialize 时获取
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 幂等补充：若 ev_mcp_logs 表已存在（早期建表），补上新字段，可重复执行
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS tool_name TEXT;
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ok';
ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT '';

-- 3. 任务表（MCP 专属，已建可跳过）
CREATE TABLE IF NOT EXISTS ev_mcp_tasks (
  id          TEXT PRIMARY KEY,             -- EV-0001
  project     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  type        TEXT DEFAULT 'feature',
  status      TEXT DEFAULT 'open',          -- open / doing / done / harvested / blocked
  source      TEXT DEFAULT 'mcp',
  priority    TEXT DEFAULT 'P2',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);