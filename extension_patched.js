// Trae 你好按钮 v0.0.17 — 修复 CDP User-Agent 识别
try { console.log('[trae-hello] extension.js start...'); } catch (_) {}

let TraeAPI;
try { TraeAPI = require('@trae/api'); } catch (e) { TraeAPI = require('vscode'); }
const { execFile } = require('child_process');
const vscode = TraeAPI;
const cdp = require('./cdp');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_TEXT = '你好';
const PRESETS = ['你好', '谢谢', '好的', '收到', '稍等一下', '继续'];
const MAX_HISTORY = 50;
const SUPABASE_URL = 'https://kqzkdpmyivtpxkfmibnd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxemtkcG15aXZ0cHhrZm1pYm5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODc1MjQyOCwiZXhwIjoyMTA0MzI4NDI4fQ.klkabFa-a5fhCVw5sbdN9kPo4iPQ3AsHjRC8NA5QASI';
const SYNC_FILE = path.join(os.homedir(), '.trae-cn', 'data-sid-sync.json');

let history = [];
let cdpAvailable = false;
let cdpPort = null;

// ---- Supabase direct log ----
function logToSupabase(role, content, dataSid, sessionId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      project: 'ev-mcp',
      role: role,
      content: content,
      data_sid: dataSid,
      session_id: sessionId || '',
      client_name: 'Trae Quick Send',
      created_at: new Date().toISOString()
    });
    const url = new URL(SUPABASE_URL + '/rest/v1/ev_mcp_logs');
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error('Supabase log failed: ' + res.statusCode + ' ' + data));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
function writeDataSidSyncFile(dataSid) {
  try {
    const dir = path.dirname(SYNC_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SYNC_FILE, JSON.stringify({ data_sid: dataSid, updated_at: new Date().toISOString() }));
  } catch (e) {}
}
function readDataSidSyncFile() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const d = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
      return d.data_sid || null;
    }
  } catch (e) {}
  return null;
}

function autoSendViaSystem() {
  const script = [
    'tell application "Visual Studio Code" to activate',
    'delay 0.3',
    'tell application "System Events"',
    '  keystroke "v" using {command down}',
    '  delay 0.15',
    '  keystroke return',
    'end tell'
  ].join('\n');
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err) => (err ? reject(err) : resolve()));
  });
}

async function sendText(text) {
  if (!text || !text.trim()) return false;
  await vscode.env.clipboard.writeText(text);
  for (const cmd of ['trae.chat', 'workbench.action.focusChat']) {
    try { await vscode.commands.executeCommand(cmd); break; } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    vscode.window.showWarningMessage('Auto send only works on macOS');
    return false;
  }
  try { await autoSendViaSystem(); return true; } catch (e) {
    vscode.window.showErrorMessage('Send failed, check Accessibility permissions');
    return false;
  }
}

function getTabFlowerKey(tabFingerprint) {
  return 'traeHelloTabFlowers:' + (tabFingerprint || 'global');
}
function getTabFlowers(context, tabFingerprint) {
  return context.globalState.get(getTabFlowerKey(tabFingerprint), { nicknames: [], activeIdx: 0 });
}
async function saveTabFlowers(context, tabFingerprint, data) {
  await context.globalState.update(getTabFlowerKey(tabFingerprint), data);
}

function getWebviewContent(presets, sessionId, nicknames, activeIdx, cdpStatus, tabFingerprint, urlSid, dataSid, version) {
  const presetsJson = JSON.stringify(presets);
  const sidJson = JSON.stringify(sessionId || '');
  const namesJson = JSON.stringify(nicknames || []);
  const idxJson = typeof activeIdx === 'number' ? activeIdx : 0;
  const cdpStatusJson = JSON.stringify(cdpStatus || { available: false });
  const tabFpJson = JSON.stringify(tabFingerprint || '');
  const urlSidJson = JSON.stringify(urlSid || '');
  const dataSidJson = JSON.stringify(dataSid || '');
  const verJson = JSON.stringify(version || '');
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h3 { margin: 0 0 10px; }
  h4 { margin: 16px 0 6px; opacity: 0.85; }
  #presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .preset { padding: 4px 12px; font-size: 13px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); border-radius: 12px; }
  .preset:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #msg { width: 100%; box-sizing: border-box; padding: 8px; font-size: 14px; line-height: 1.5; resize: vertical; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; font-family: inherit; }
  #sendRow { margin-top: 10px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  #send { padding: 8px 22px; font-size: 14px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; }
  #send:hover { background: var(--vscode-button-hoverBackground); }
  #sid { font-size: 12px; opacity: 0.75; font-family: monospace; cursor: pointer; padding: 2px 6px; border: 1px dashed var(--vscode-panel-border); border-radius: 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #sid:hover { opacity: 1; }
  #cdpStatus { font-size: 10px; opacity: 0.5; margin-bottom: 8px; }
  #cdpStatus.green { color: #4caf50; }
  #cdpStatus.red { color: #f44336; }
  #nicknameRow { margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; flex-wrap: wrap; }
  #nicknamePrev, #nicknameNext { cursor: pointer; font-size: 13px; background: none; border: none; color: var(--vscode-foreground); opacity: 0.5; padding: 0 2px; }
  #nicknamePrev:hover, #nicknameNext:hover { opacity: 1; }
  #nicknameDisplay { cursor: pointer; padding: 2px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-list-inactiveSelectionBackground); }
  #nicknameDisplay:hover { background: var(--vscode-list-hoverBackground); }
  #nicknameInput { display: none; padding: 2px 6px; font-size: 13px; border: 1px solid var(--vscode-input-border); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; width: 130px; }
  #nicknameSave { display: none; padding: 2px 10px; font-size: 12px; cursor: pointer; }
  #nicknameRoll { cursor: pointer; font-size: 14px; background: none; border: none; color: var(--vscode-foreground); opacity: 0.6; padding: 0 4px; }
  #nicknameRoll:hover { opacity: 1; }
  .nicknameLabel { opacity: 0.7; }
  .nicknameIdx { font-size: 11px; opacity: 0.5; min-width: 24px; text-align: center; }
  #tabInfo { font-size: 10px; opacity: 0.4; font-family: monospace; margin-left: 4px; }
  #history { list-style: none; padding: 0; margin: 0; max-height: 180px; overflow-y: auto; }
  #history li { margin-bottom: 6px; }
  .hist { width: 100%; text-align: left; padding: 6px 8px; font-size: 13px; cursor: pointer; background: var(--vscode-list-inactiveSelectionBackground); color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hist:hover { background: var(--vscode-list-hoverBackground); }
  .hint { margin-top: 12px; font-size: 12px; opacity: 0.7; }
  .hint a { color: var(--vscode-textLink-foreground); }
</style>
</head>
<body>
  <h3>Trae Quick Send <span style="font-size:10px;opacity:0.45;font-weight:normal;font-family:monospace">v${verJson}</span></h3>
  <div id="cdpStatus"></div>
  <div id="presets"></div>
  <textarea id="msg" rows="4" placeholder="Enter text to send..."></textarea>
  <div id="sendRow">
    <button id="send">Send</button>
    <span id="sid" title="Click to copy Trae session ID"></span>
  </div>
  <div id="idInfo" style="margin-top: 6px; font-size: 11px; opacity: 0.65; font-family: monospace; line-height: 1.5;">
    <div id="urlSidInfo" title="Click to copy URL session UUID"></div>
    <div id="dataSidInfo" title="Click to copy data-session-id"></div>
  </div>
  <div id="nicknameRow">
    <span class="nicknameLabel">🌸 Nickname</span>
    <button id="nicknamePrev" title="Previous">⬅</button>
    <span id="nicknameDisplay"></span>
    <button id="nicknameNext" title="Next">➡</button>
    <input id="nicknameInput" type="text" placeholder="Edit..." />
    <button id="nicknameSave" class="preset" style="display:none;">OK</button>
    <button id="nicknameRoll" title="Random nickname">🔄</button>
    <span class="nicknameIdx" id="nicknameIdx"></span>
    <span id="tabInfo"></span>
  </div>
  <h4>Send History</h4>
  <ul id="history"></ul>
  <div class="hint" id="hintArea">Click nickname to edit; 🔄 to generate random.</div>
  <script>
    const vsc = acquireVsCodeApi();
    const presets = ${presetsJson};
    const SESSION_ID = ${sidJson};
    var CDP_STATUS = ${cdpStatusJson};
    var TAB_FP = ${tabFpJson};
    var URL_SID = ${urlSidJson};
    var DATA_SID = ${dataSidJson};
    const FLOWERS = ['Shancha','Dujuan','Sunflower','Rose','Tulip','Daisy','Sakura','Peony','Begonia','Jasmine','Peach','Plum','Daffodil','Lily','Wisteria','Lotus','Peony2','Lilac','Rose2','Hibiscus','Kapok','Hyacinth','Lavender','Iris'];
    let nicknames = ${namesJson};
    let activeIdx = ${idxJson};
    let currentNick = '';
    const ta = document.getElementById('msg');
    const sidEl = document.getElementById('sid');
    const nickDisplay = document.getElementById('nicknameDisplay');
    const nickInput = document.getElementById('nicknameInput');
    const nickSave = document.getElementById('nicknameSave');
    const nickRoll = document.getElementById('nicknameRoll');
    const nickPrev = document.getElementById('nicknamePrev');
    const nickNext = document.getElementById('nicknameNext');
    const nickIdx = document.getElementById('nicknameIdx');
    const tabInfo = document.getElementById('tabInfo');
    const cdpEl = document.getElementById('cdpStatus');
    const hintArea = document.getElementById('hintArea');

    function renderCdpStatus() {
      if (CDP_STATUS && CDP_STATUS.available) {
        cdpEl.className = 'green';
        cdpEl.textContent = 'CDP connected · Tab: ' + (TAB_FP || '-').slice(0, 16);
        if (TAB_FP) tabInfo.textContent = '[' + TAB_FP.slice(0, 8) + ']';
      } else if (CDP_STATUS && CDP_STATUS.attempted) {
        cdpEl.className = 'red';
        cdpEl.textContent = 'CDP not available · fallback mode';
        hintArea.innerHTML = 'Click nickname to edit; 🔄 random. ⚠️ Restart Trae with <code>--remote-debugging-port=9229</code>';
      } else {
        cdpEl.className = '';
        cdpEl.textContent = 'Detecting CDP...';
      }
    }
    renderCdpStatus();

    presets.forEach(function(p) {
      var b = document.createElement('button');
      b.className = 'preset';
      b.textContent = p;
      b.addEventListener('click', function() { vsc.postMessage({ type: 'send', text: p }); });
      document.getElementById('presets').appendChild(b);
    });

    function renderSid() {
      if (!SESSION_ID) { sidEl.textContent = 'SessionID: N/A'; return; }
      sidEl.textContent = 'SessionID: ' + SESSION_ID;
      sidEl.addEventListener('click', function() {
        vsc.postMessage({ type: 'copy', text: SESSION_ID });
        sidEl.title = 'Copied: ' + SESSION_ID;
      });
    }
    renderSid();

    function renderIds() {
      var uEl = document.getElementById('urlSidInfo');
      var dEl = document.getElementById('dataSidInfo');
      if (URL_SID) {
        uEl.textContent = 'URL: ' + URL_SID;
        uEl.style.cursor = 'pointer';
        uEl.addEventListener('click', function() {
          vsc.postMessage({ type: 'copy', text: URL_SID });
          uEl.title = 'Copied: ' + URL_SID;
        });
      } else {
        uEl.textContent = 'URL: (CDP off)';
      }
      if (DATA_SID) {
        dEl.textContent = 'data-sid: ' + DATA_SID;
        dEl.style.cursor = 'pointer';
        dEl.addEventListener('click', function() {
          vsc.postMessage({ type: 'copy', text: DATA_SID });
          dEl.title = 'Copied: ' + DATA_SID;
        });
      } else {
        dEl.textContent = 'data-sid: (CDP off)';
      }
    }
    renderIds();

    function pickFlower() {
      var used = {};
      nicknames.forEach(function(n) { used[n.split(' ')[0]] = true; });
      var available = FLOWERS.filter(function(f) { return !used[f]; });
      if (available.length === 0) available = FLOWERS;
      return available[Math.floor(Math.random() * available.length)];
    }

    function saveNicknames() {
      vsc.postMessage({
        type: 'setNicknames',
        nicknames: nicknames,
        activeIdx: activeIdx,
        tabFingerprint: TAB_FP
      });
    }

    function renderNickname() {
      if (nicknames.length === 0) {
        currentNick = pickFlower();
        nicknames.push(currentNick);
        activeIdx = 0;
        saveNicknames();
      } else {
        if (activeIdx >= nicknames.length) activeIdx = nicknames.length - 1;
        if (activeIdx < 0) activeIdx = 0;
        currentNick = nicknames[activeIdx];
      }
      nickDisplay.textContent = currentNick;
      nickInput.style.display = 'none';
      nickSave.style.display = 'none';
      nickDisplay.style.display = 'inline';
      nickIdx.textContent = nicknames.length > 1 ? (activeIdx + 1) + '/' + nicknames.length : '';
      nickPrev.style.opacity = nicknames.length > 1 ? '1' : '0.3';
      nickNext.style.opacity = nicknames.length > 1 ? '1' : '0.3';
    }
    renderNickname();

    nickRoll.addEventListener('click', function() {
      currentNick = pickFlower();
      nicknames.push(currentNick);
      activeIdx = nicknames.length - 1;
      nickDisplay.textContent = currentNick;
      saveNicknames();
      renderNickname();
    });

    nickPrev.addEventListener('click', function() {
      if (nicknames.length <= 1) return;
      activeIdx = (activeIdx - 1 + nicknames.length) % nicknames.length;
      currentNick = nicknames[activeIdx];
      nickDisplay.textContent = currentNick;
      saveNicknames();
      renderNickname();
    });

    nickNext.addEventListener('click', function() {
      if (nicknames.length <= 1) return;
      activeIdx = (activeIdx + 1) % nicknames.length;
      currentNick = nicknames[activeIdx];
      nickDisplay.textContent = currentNick;
      saveNicknames();
      renderNickname();
    });

    nickDisplay.addEventListener('click', function() {
      nickDisplay.style.display = 'none';
      nickInput.style.display = 'inline';
      nickSave.style.display = 'inline';
      nickInput.value = currentNick;
      nickInput.focus();
    });

    function doSaveEdit() {
      var newName = nickInput.value.trim();
      if (newName && activeIdx >= 0 && activeIdx < nicknames.length) {
        nicknames[activeIdx] = newName;
        currentNick = newName;
      }
      saveNicknames();
      renderNickname();
    }
    nickSave.addEventListener('click', doSaveEdit);
    nickInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); doSaveEdit(); }
      if (e.key === 'Escape') { renderNickname(); }
    });

    function doSend() {
      var text = ta.value;
      if (!text.trim()) { ta.focus(); return; }
      vsc.postMessage({ type: 'send', text: text });
      ta.value = '';
    }
    document.getElementById('send').addEventListener('click', doSend);
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSend(); }
    });

    function renderHistory(items) {
      var box = document.getElementById('history');
      box.innerHTML = '';
      items.slice().reverse().forEach(function(t) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.className = 'hist';
        btn.textContent = t.length > 30 ? t.slice(0, 30) + '...' : t;
        btn.title = t;
        btn.addEventListener('click', function() { ta.value = t; ta.focus(); });
        li.appendChild(btn);
        box.appendChild(li);
      });
      if (!items.length) {
        var li = document.createElement('li');
        li.style.opacity = '0.6';
        li.style.fontSize = '12px';
        li.textContent = '(empty)';
        box.appendChild(li);
      }
    }

    window.addEventListener('message', function(e) {
      var m = e.data;
      if (!m) return;
      if (m.type === 'init') { renderHistory(m.history || []); return; }
      if (m.type === 'cdpUpdate') {
        if (m.cdpStatus) CDP_STATUS = m.cdpStatus;
        if (typeof m.tabFingerprint === 'string') TAB_FP = m.tabFingerprint;
        if (typeof m.urlSid === 'string') URL_SID = m.urlSid;
        if (typeof m.dataSid === 'string') DATA_SID = m.dataSid;
        if (Array.isArray(m.nicknames)) nicknames = m.nicknames;
        if (typeof m.activeIdx === 'number') activeIdx = m.activeIdx;
        renderCdpStatus();
        renderIds();
        renderNickname();
        return;
      }
    });

    vsc.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function activate(context) {
  const EXT_VERSION = require('./package.json').version || '0.0.0';

  let logChan = null;
  const log = (...args) => {
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);
    const line = '[' + ts + '] ' + args.join(' ');
    if (logChan) { try { logChan.appendLine(line); } catch (_) {} }
    try { console.log(line); } catch (_) {}
  };
  try { logChan = vscode.window.createOutputChannel('Trae Quick Send'); } catch (_) {}
  try { context.subscriptions.push(logChan); } catch (_) {}
  log('Plugin active v' + EXT_VERSION);

  const helloItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  helloItem.text = '$(comment) Hello';
  helloItem.tooltip = 'Click to send Hello';
  helloItem.command = 'trae-hello.send';
  helloItem.show();

  const inputItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  inputItem.text = '$(edit) Input Send';
  inputItem.tooltip = 'Open input panel';
  inputItem.command = 'trae-hello.openInput';
  inputItem.show();

  // data-session-id 状态栏按钮 — 定时轮询 CDP 自动更新
  const dataSessionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  dataSessionItem.text = '$(key) data-sid: ...';
  dataSessionItem.tooltip = 'data-session-id (click to copy)';
  dataSessionItem.command = 'trae-hello.copyDataSessionId';
  dataSessionItem.show();

  let currentDataSessionId = null;
  let activePanel = null;
  let cdpPollTimer = null;
  let polling = false;

  async function pollDataSessionId() {
    if (polling) return;
    polling = true;
    try {
      const port = await cdp.discoverCdpPort();
      if (!port) { dataSessionItem.text = '$(key) data-sid: (no CDP)'; polling = false; return; }
      const fp = await cdp.getChatTabFingerprint(port);
      const newId = (fp && fp.dataSessionId) || null;
      if (newId !== currentDataSessionId) {
        currentDataSessionId = newId;
        if (newId) {
          dataSessionItem.text = '$(key) data-sid: ' + newId;
          dataSessionItem.tooltip = 'data-session-id: ' + newId + ' (click to copy)';
          writeDataSidSyncFile(newId);
          if (activePanel) { try { activePanel.webview.postMessage({ type: 'cdpUpdate', dataSid: newId }); } catch (_) {} }
        } else {
          dataSessionItem.text = '$(key) data-sid: (not found)';
          dataSessionItem.tooltip = 'data-session-id not found in current webview';
        }
      }
    } catch (e) {
      dataSessionItem.text = '$(key) data-sid: (error)';
    }
    polling = false;
  }

  // 首次轮询 + 每 10 秒轮询
  pollDataSessionId();
  cdpPollTimer = setInterval(pollDataSessionId, 10000);

  const copyDataSessionId = vscode.commands.registerCommand('trae-hello.copyDataSessionId', async () => {
    if (currentDataSessionId) {
      await vscode.env.clipboard.writeText(currentDataSessionId);
      vscode.window.showInformationMessage('data-session-id copied: ' + currentDataSessionId);
    } else {
      vscode.window.showWarningMessage('data-session-id not available');
    }
  });

  const sendHello = vscode.commands.registerCommand('trae-hello.send', async () => {
    if (!currentDataSessionId) { vscode.window.showWarningMessage('data-sid 丢失，请刷新聊天页面或重启 Trae 后重试'); return; }
    try { await logToSupabase('user', DEFAULT_TEXT, currentDataSessionId, vscode.env.sessionId); } catch (e) { log('Supabase log fail: ' + e.message); }
    const ok = await sendText(DEFAULT_TEXT);
    if (ok) vscode.window.showInformationMessage('Sent Hello');
  });

  const openInput = vscode.commands.registerCommand('trae-hello.openInput', async () => {
    log('openInput clicked');
    try {
    const panel = vscode.window.createWebviewPanel(
      'traeHelloInput',
      'Trae Quick Send',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    activePanel = panel;
    panel.onDidDispose(() => { activePanel = null; });
    log('panel created, rendering placeholder...');

    let nicknames = context.globalState.get('traeHelloNicknames', []);
    let activeIdx = context.globalState.get('traeHelloNickActive', 0);
    let tabFingerprint = null;
    let cdpStatus = { available: false, attempted: false, error: null };

    panel.webview.html = getWebviewContent(PRESETS, vscode.env.sessionId, nicknames, activeIdx, cdpStatus, null, null, null, EXT_VERSION);
    log('HTML rendered (placeholder), length=' + panel.webview.html.length);

    (async () => {
      try {
        log('CDP: discovering port...');
        const t0 = Date.now();
        const discoveredPort = await cdp.discoverCdpPort();
        log('CDP: port discover done (' + (Date.now() - t0) + 'ms), result: ' + (discoveredPort || 'null'));
        if (!discoveredPort) { log('CDP: no port, fallback'); return; }
        const fp = await cdp.getChatTabFingerprint(discoveredPort);
        log('CDP: fp=' + (fp && fp.fingerprint || 'null') + ' url=' + (fp && fp.urlSessionId || '-') + ' data=' + (fp && fp.dataSessionId || '-'));
        let nick = nicknames, idx = activeIdx, saveFp = null;
        if (fp && fp.fingerprint) {
          const d = getTabFlowers(context, fp.fingerprint);
          nick = (d && d.nicknames) ? d.nicknames : nicknames;
          idx = (d && typeof d.activeIdx === 'number') ? d.activeIdx : activeIdx;
          saveFp = fp.fingerprint;
          nicknames = nick; activeIdx = idx; tabFingerprint = saveFp;
          cdpStatus = { available: true, attempted: true, error: null, method: fp.method, port: discoveredPort };
        } else {
          cdpStatus = { available: true, attempted: true, error: 'no-fingerprint', port: discoveredPort };
        }
        panel.webview.postMessage({
          type: 'cdpUpdate', cdpStatus,
          tabFingerprint: saveFp,
          urlSid: (fp && fp.urlSessionId) || null,
          dataSid: (fp && fp.dataSessionId) || readDataSidSyncFile(),
          nicknames: nick, activeIdx: idx
        });
        log('CDP: update pushed to panel');
      } catch (e) {
        log('CDP bg update failed: ' + e.message);
        cdpStatus = { available: false, attempted: true, error: e.message };
        try { panel.webview.postMessage({ type: 'cdpUpdate', cdpStatus }); } catch (_) {}
      }
    })();

    panel.webview.onDidReceiveMessage(async (msg) => {
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'ready') {
        panel.webview.postMessage({ type: 'init', history: history });
        panel.webview.postMessage({ type: 'cdpUpdate', dataSid: currentDataSessionId, nicknames: nicknames, activeIdx: activeIdx });
        return;
      }

      if (msg.type === 'copy' && typeof msg.text === 'string') {
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Session ID copied');
        return;
      }

      if (msg.type === 'setNicknames' && Array.isArray(msg.nicknames)) {
        const fp = msg.tabFingerprint || null;
        const data = { nicknames: msg.nicknames, activeIdx: typeof msg.activeIdx === 'number' ? msg.activeIdx : 0 };
        if (fp) {
          await saveTabFlowers(context, fp, data);
        } else {
          await context.globalState.update('traeHelloNicknames', msg.nicknames);
          await context.globalState.update('traeHelloNickActive', typeof msg.activeIdx === 'number' ? msg.activeIdx : 0);
        }
        return;
      }

      if (msg.type === 'send' && typeof msg.text === 'string') {
        if (!currentDataSessionId) { vscode.window.showWarningMessage('data-sid 丢失，请刷新聊天页面或重启 Trae 后重试'); return; }
        try { await logToSupabase('user', msg.text, currentDataSessionId, vscode.env.sessionId); } catch (e) { log('Supabase log fail: ' + e.message); }
        const ok = await sendText(msg.text);
        if (ok) {
          history.push(msg.text);
          if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
          panel.webview.postMessage({ type: 'init', history: history });
          const preview = msg.text.length > 20 ? msg.text.slice(0, 20) + '...' : msg.text.replace(/\n/g, ' ');
          vscode.window.showInformationMessage('Sent: ' + preview);
        }
      }
    });
  } catch (e) {
    log('openInput error: ' + e.message + (e.stack ? ' | ' + e.stack.split('\n').slice(0, 3).join(' | ') : ''));
    vscode.window.showErrorMessage('Panel open failed: ' + e.message);
  }
  });

  context.subscriptions.push(helloItem, inputItem, dataSessionItem, sendHello, openInput, copyDataSessionId);

  // 清理定时器
  context.subscriptions.push({ dispose: () => { if (cdpPollTimer) clearInterval(cdpPollTimer); } });

  if (process.env.TRAE_REMOTE_DEBUGGING_PORT) {
    cdpPort = parseInt(process.env.TRAE_REMOTE_DEBUGGING_PORT, 10);
    if (cdpPort) cdpAvailable = true;
  } else {
    cdp.discoverCdpPort().then(port => {
      if (port) { cdpAvailable = true; cdpPort = port; }
    }).catch(() => {});
  }
}

function deactivate() {}

module.exports = { activate, deactivate };