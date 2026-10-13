#!/usr/bin/env node
/**
 * ev-mcp —— AI 对话任务管理 & 日志 MCP Server (Supabase 纯线上版)
 *
 * 2026-10-13 用户定：全 Supabase 线上，无本地降级存储。
 *   所有任务、日志、会话记录只存 Supabase ev_mcp_* 表。
 *   Supabase 不通 = 服务不可用，不降级。
 *
 * 工具：
 *   ev_status  /  ev_add_task  /  ev_start  /  ev_done  /  ev_harvest  /  ev_log_message
 */
const fs = require("fs");
const path = require("path");

// ---- 配置 ----
const PROJECT = process.env.EV_PROJECT || path.basename(process.cwd());
let clientName = "";   // initialize 时由客户端上报，如 "Trae"
let clientVersion = "";

// ---- 加载 .env ----
(function loadDotEnv() {
  const envPaths = [
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".ev-mcp", ".env"),
  ];
  for (const envPath of envPaths) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      content.split("\n").forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return;
        const i = t.indexOf("=");
        if (i === -1) return;
        let k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      });
    } catch {}
  }
})();

// ---- Supabase REST 客户端（零依赖，Node 18+ 原生 fetch）----
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_Ev_SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Ev_SUPABASE_SERVICE_ROLE_KEY || "";

async function sb(method, path, body) {
  const url = SB_URL + "/rest/v1/" + path;
  const headers = {
    "apikey": SB_KEY,
    "Authorization": "Bearer " + SB_KEY,
    "Content-Type": "application/json",
    "Prefer": method === "POST" || method === "PATCH" ? "return=minimal" : "return=representation",
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(method + " " + url + " => " + res.status + " " + errTxt);
  }
  const txt = await res.text();
  if (!txt) return [];
  return JSON.parse(txt);
}

// ---- 会话追踪（PID+时间戳唯一ID + Supabase持久化，花名由AI起）----
const PID = process.pid;
const PID36 = PID.toString(36).toUpperCase();
const TS36 = (Date.now() % 0xFFFF).toString(36).toUpperCase();
const RND = Math.random().toString(36).slice(2, 5).toUpperCase();
const sessionId = "S" + PID36 + "-" + TS36 + RND;   // 如 S2AB-3FQ7X
let sessionName = null;     // 花名，由 AI 通过 ev_name_session 起
let roundCount = 0;

// Supabase 会话操作（纯线上）
async function dbCreateSession(id, project, name) {
  return sb("POST", "ev_mcp_sessions", {
    id, project,
    name: name || null,
    pid: PID,
    started_at: new Date().toISOString(),
  });
}
async function dbRenameSession(id, project, name) {
  const q = "project=eq." + encodeURIComponent(project) + "&id=eq." + encodeURIComponent(id);
  return sb("PATCH", "ev_mcp_sessions?" + q, { name });
}
async function dbCheckNameUnique(project, name) {
  const rows = await sb("GET", "ev_mcp_sessions?project=eq." + encodeURIComponent(project) + "&name=eq." + encodeURIComponent(name));
  return !rows || rows.length === 0;
}

// 启动时创建会话记录（纯 Supabase 线上）
(function initSession() {
  console.error("[ev-mcp] 会话=" + sessionId + " PID=" + PID);

  if (SB_URL && SB_KEY) {
    dbCreateSession(sessionId, PROJECT, null).then(() => {
      console.error("[ev-mcp] 会话已写入 Supabase ev_mcp_sessions");
    }).catch((e) => {
      console.error("[ev-mcp] 会话 Supabase 写入失败:", e.message);
    });
  } else {
    console.error("[ev-mcp] ⚠ SUPABASE_URL/KEY 未配置，服务不可用");
  }
})();

// ---- 工具定义 ----
const TOOLS = [
  {
    name: "ev_status",
    description: "读取任务状态并输出 SDR 底部表格。每轮对话开始时必须调用，把返回的完整 SDR 表格附在回复末尾。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ev_add_task",
    description: "登记新任务并返回单号。用户下达任何任务时必须先调用（标题 + 不少于 50 字的描述）。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "任务标题" },
        description: { type: "string", description: "任务描述，不少于 50 字" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "ev_start",
    description: "领取/开始一个任务，把它从 open 置为进行中(doing)。进行中期间，记录对话日志必须传入该任务单号 task_id。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "任务单号，如 EV-0001" } },
      required: ["id"],
    },
  },
  {
    name: "ev_done",
    description: "把指定单号的任务标记为完成。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "任务单号，如 EV-0001" } },
      required: ["id"],
    },
  },
  {
    name: "ev_harvest",
    description: "收割所有已完成（done）任务并输出清单。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ev_log_message",
    description: "记录对话消息到 ev_mcp_logs 表。用于记录用户和助手的每次对话。",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "角色: user / assistant / system" },
        content: { type: "string", description: "消息内容" },
        session_id: { type: "string", description: "会话ID，可选" },
        task_id: { type: "string", description: "任务单号(如 EV-0001)。存在进行中任务期间必须传入，否则拒绝记录" },
        tool_name: { type: "string", description: "产生该日志的工具名，可选" },
      },
      required: ["role", "content"],
    },
  },
  {
    name: "ev_name_session",
    description: "【必须自己起名，不要问用户】给当前会话起一个花名（≤8汉字，含1个emoji），如 🐘象往。这是 AI 自己的职责，绝不可把起名任务抛回给用户。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "会话花名，如 🐘象往、🔧扳手" },
      },
      required: ["name"],
    },
  },
];

function statusLine(tasks) {
  const c = (st) => tasks.filter((t) => t.status === st).length;
  const name = sessionName ? sessionName + " " : "";
  return `[SDR] ${name}会话${sessionId} 对话=${roundCount} 任务 领取=${tasks.length} 进行中=${c("doing")} 阻塞=${c("blocked")} 完成=${c("done") + c("harvested")} 待收割=${c("done")}`;
}

// ---- Supabase REST 操作 ----
async function dbLoadTasks() {
  const data = await sb("GET", "ev_mcp_tasks?project=eq." + encodeURIComponent(PROJECT) + "&order=id.asc");
  return data || [];
}

function genTaskId() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const rand = Math.random().toString(16).slice(2, 6);
  const tool = (clientName || "unknown").toLowerCase();
  const proj = (process.env.EV_PROJECT || path.basename(__dirname)).toLowerCase();
  return `evm-${tool}-${proj}-${y}${m}${d}-${hh}${mm}-${rand}`;
}

async function dbInsert(task) {
  await sb("POST", "ev_mcp_tasks", task);
}

async function dbUpdate(id, fields) {
  const q = "project=eq." + encodeURIComponent(PROJECT) + "&id=eq." + encodeURIComponent(id);
  await sb("PATCH", "ev_mcp_tasks?" + q, fields);
}

async function dbLogMessage(role, content, sessionId, taskId, toolName, durationMs, requestId, status, clientN) {
  await sb("POST", "ev_mcp_logs", {
    project: PROJECT,
    role,
    content,
    session_id: sessionId || null,
    task_id: taskId || null,
    tool_name: toolName || null,
    duration_ms: durationMs || null,
    request_id: requestId || null,
    status: status || "ok",
    client_name: clientN || clientName || "",
    created_at: new Date().toISOString(),
  });
}

// ---- Supabase 模式 ----
async function dbTool(name, args) {
  // 花名门禁：未设花名时，只允许 ev_name_session 和 ev_status（查看状态）
  const UNGUARDED = ["ev_name_session", "ev_status"];
  if (!sessionName && !UNGUARDED.includes(name)) {
    return "🚫 尚未设置花名！\n必须自己起名，不要问我——请立即调用 ev_name_session 自己起一个名字（须含 emoji，如 🔨小铁锤、🐘象往），不要问用户，这是 AI 自己的职责。";
  }

  if (name === "ev_status") {
    roundCount++;
    const tasks = await dbLoadTasks();
    const c = (st) => tasks.filter((t) => t.status === st).length;
    const name = sessionName || "❓未命名";
    const harvested = c("harvested");
    const doneCount = c("done") + harvested;
    const doingCount = c("doing");
    const blockedCount = c("blocked");
    const total = tasks.length;

    const taskList = tasks.map((t) => `- ${t.id} [${t.status}] ${t.title}`).join("\n");

    const sdr = [
      "📋 SDR（会话纪律记录）",
      "| 项目 | 值 | 项目 | 值 |",
      "|------|------|------|------|",
      `| 花名 | ${name} | SID | ${sessionId} |`,
      `| 对话 | ${roundCount} 轮 | 任务 | 领${total} · 进行中${doingCount} · 完成${doneCount} |`,
      `| 待收割 | ${harvested} | 阻塞 | ${blockedCount} |`,
    ].join("\n");

    return sdr + "\n\n" + (taskList || "（无任务）");
  }
  if (name === "ev_add_task") {
    const id = genTaskId();
    const task = {
      id,
      project: PROJECT,
      title: args.title,
      description: args.description || "",
      type: "feature",
      status: "open",
      source: "mcp",
      priority: "P2",
      created_at: new Date().toISOString(),
    };
    await dbInsert(task);
    return `已登记 ${id}：${args.title}`;
  }
  if (name === "ev_start") {
    const tasks = await dbLoadTasks();
    const t = tasks.find((t) => t.id === args.id);
    if (!t) return `未找到单号 ${args.id}`;
    if (t.status !== "open") return `只有 open 任务可开始，当前 ${args.id} 是 ${t.status}`;
    await dbUpdate(args.id, { status: "doing" });
    return `${args.id} 已开始（进行中）`;
  }
  if (name === "ev_done") {
    const tasks = await dbLoadTasks();
    const t = tasks.find((t) => t.id === args.id);
    if (!t) return `未找到单号 ${args.id}`;
    await dbUpdate(args.id, { status: "done" });
    return `${args.id} 已完成`;
  }
  if (name === "ev_harvest") {
    const tasks = await dbLoadTasks();
    const done = tasks.filter((t) => t.status === "done");
    if (!done.length) return "无待收割任务";
    const lines = done.map((t) => `- ${t.id} ${t.title}`).join("\n");
    for (const t of done) {
      await dbUpdate(t.id, { status: "harvested" });
    }
    return `收割 ${done.length} 条：\n${lines}`;
  }
  if (name === "ev_log_message") {
    if (!args.role || !args.role.trim()) return "❌ role 字段必填，不能为空";
    if (!args.content || !args.content.trim()) return "❌ content 字段必填，不能为空";
    const tasks = await dbLoadTasks();
    const inProgress = tasks.filter((t) => t.status === "doing");
    if (inProgress.length > 0) {
      if (!args.task_id) {
        return `❌ 当前存在进行中任务（${inProgress.map((t) => t.id).join(", ")}），记录日志必须传入 task_id`;
      }
      const hit = inProgress.find((t) => t.id === args.task_id);
      if (!hit) {
        return `❌ task_id ${args.task_id} 不是进行中任务（当前进行中：${inProgress.map((t) => t.id).join(", ")}），请检查`;
      }
    }
    await dbLogMessage(args.role, args.content, args.session_id || sessionId, args.task_id, args.tool_name, args.duration_ms, null, "ok", clientName);
    return `已记录 [${args.role}]: ${args.content.slice(0, 80)}${args.content.length > 80 ? "..." : ""}`;
  }
  if (name === "ev_name_session") {
    const newName = args.name.trim();
    // 先查 Supabase 是否重复
    let ok = true;
    try { ok = await dbCheckNameUnique(PROJECT, newName); } catch {}
    if (!ok) return `❌ 花名 "${newName}" 已被本项目的其他会话使用，请换一个。`;
    try { await dbRenameSession(sessionId, PROJECT, newName); } catch {}
    sessionName = newName;
    return `🌸 会话花名已定为：${newName}`;
  }
  throw new Error("unknown tool: " + name);
}

let useDb = false;

async function callTool(name, args, reqId) {
  const startedAt = Date.now();
  let result, status = "ok";
  if (!SB_URL || !SB_KEY) {
    throw new Error("Supabase 未配置，服务不可用");
  }
  result = await dbTool(name, args);

  // 工具调用真实耗时（MCP 内部可测，非 token 计费）
  const durationMs = Date.now() - startedAt;
  const toolName = name;

  // 自动落库：每次 tools/call 完成后记一条 assistant 日志
  // ev_log_message 自己已在 dbTool 里记过，跳过避免重复
  if (name !== "ev_log_message" && useDb && result) {
    try {
      const text = typeof result === "string" ? result : JSON.stringify(result);
      let taskId = null;
      try {
        const tasks = await dbLoadTasks();
        const doing = tasks.filter((t) => t.status === "doing");
        if (doing.length > 0) taskId = doing[0].id;
      } catch {}
      await dbLogMessage("assistant", text.slice(0, 500), sessionId, taskId, toolName, durationMs, reqId != null ? String(reqId) : null, status, clientName);
    } catch (e) {
      console.error("[ev-mcp] auto-log failed:", e.message);
    }
  }

  return { result, durationMs, toolName };
}

// ---- 初始化检查 ----
(async function init() {
  if (SB_URL && SB_KEY) {
    try {
      await sb("GET", "ev_mcp_tasks?limit=0");
      useDb = true;
      console.error("[ev-mcp] Supabase connected:", SB_URL, "| project:", PROJECT);
    } catch (e) {
      console.error("[ev-mcp] Supabase unreachable (table may not exist):", e.message);
      console.error("[ev-mcp] 服务不可用，请确认 Supabase 项目 kqzkdpmyivtpxkfmibnd 中存在 ev_mcp_tasks 表");
    }
  }
})();

// ---- MCP 协议 ----
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    const { id, method, params } = req;

    (async () => {
      if (method === "initialize") {
        if (params && params.clientInfo) {
          clientName = params.clientInfo.name || "";
          clientVersion = params.clientInfo.version || "";
        }
        send({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: (params && params.protocolVersion) || "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "ev-mcp", version: "0.2.0" },
          },
        });
      } else if (method === "tools/list") {
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      } else if (method === "tools/call") {
        try {
          const out = await callTool(params.name, params.arguments || {}, id);
          const text = out.result;
          send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
        } catch (e) {
          send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "错误：" + e.message }], isError: true } });
        }
      } else if (method === "ping") {
        send({ jsonrpc: "2.0", id, result: {} });
      } else if (method === "resources/list") {
        send({ jsonrpc: "2.0", id, result: { resources: [] } });
      } else if (method === "prompts/list") {
        send({ jsonrpc: "2.0", id, result: { prompts: [] } });
      } else if (id !== undefined) {
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found: " + method } });
      }
    })();
  }
});