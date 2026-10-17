-- 2026-10-17 · trae-hello v0.5.6：会话窗口级花名表
--
-- 背景：ev_mcp_chat_sessions 的主键 data_sid 来自页面 [data-session-id] 元素，前端重建就变
-- （实测同一窗口 985740b5 在 18 分钟内换过 6 个 data_sid）。按 data_sid 存花名会反复"变黑户"，
-- 按 data_sid 统计对话会一换就归零。窗口 id（webview URL 的 ?id=）在同一会话内恒定，才是稳定键。

create table if not exists public.ev_mcp_chat_window_names (
  url_session_id text primary key,
  name           text not null,
  data_sid       text,
  source         text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 服务端走 service_role，开 RLS 只挡 anon
alter table public.ev_mcp_chat_window_names enable row level security;

-- 花名跨窗口唯一（每会话独立、不重名），大小写不敏感
create unique index if not exists ev_mcp_chat_window_names_name_key
  on public.ev_mcp_chat_window_names (lower(name));

-- 统计要按窗口聚合 data_sid 列表
create index if not exists ev_mcp_chat_sessions_url_idx
  on public.ev_mcp_chat_sessions (url_session_id);

-- 一次性迁移：每个窗口取 last_seen_at 最新那一行的 name
insert into public.ev_mcp_chat_window_names (url_session_id, name, data_sid, source)
select distinct on (url_session_id) url_session_id, name, data_sid, 'migrated'
from public.ev_mcp_chat_sessions
where coalesce(name, '') <> '' and coalesce(url_session_id, '') <> ''
order by url_session_id, last_seen_at desc nulls last, started_at desc nulls last
on conflict (url_session_id) do nothing;
