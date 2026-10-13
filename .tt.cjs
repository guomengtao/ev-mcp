const { spawn } = require("child_process");
const child = spawn("node", ["index.js"], { cwd: __dirname });
let buf = "", seq = [];
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    try { const o = JSON.parse(line); seq.push(o); } catch {}
  }
});
child.stderr.on("data", (d) => process.stderr.write("[S] " + d));
child.on("exit", () => {
  for (const c of seq) {
    const r = c.result && c.result.content && c.result.content[0];
    console.log(`[${c.id}] ${r ? r.text.slice(0, 120) : c.error ? "ERR:" + c.error.message : JSON.stringify(c).slice(0, 80)}`);
  }
  process.exit(0);
});
const send = (id, name, args) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");

// initialize with clientInfo
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: "init", method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "Trae", version: "1.5.0" } } }) + "\n");

// 1. ev_add_task -> auto-log as assistant with tool_name=ev_add_task
setTimeout(() => send(1, "ev_add_task", { title: "T auto-log test", description: "testing automatic assistant logging after every tool call end to end verification of the MCP server." }), 400);

// 2. ev_status -> auto-log with status=ok, client_name=Trae
setTimeout(() => send(2, "ev_status", {}), 1000);

// 3. ev_start -> task doing, then ev_status -> auto-log should have task_id=EV-0001
setTimeout(() => send(3, "ev_start", { id: "EV-0001" }), 1600);
setTimeout(() => send(4, "ev_done", { id: "EV-0001" }), 2200);

// 4. ev_log_message -> should NOT auto-log (no duplicate assistant entry)
setTimeout(() => send(5, "ev_log_message", { role: "user", content: "手动日志,不应重复" }), 2800);

// 5. harvest -> auto-log as assistant
setTimeout(() => send(6, "ev_harvest", {}), 3400);

setTimeout(() => child.kill(), 4800);