import sys

filepath = '/Users/Banner/Documents/guomengtao/ev/evdb/public/app.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add THEME_KEY constant near UI_KEY
old_ui = "const UI_KEY = 'sbexplorer.ui.v1';"
new_ui = "const UI_KEY = 'sbexplorer.ui.v1';\nconst THEME_KEY = 'sbexplorer.theme.v1';"
if old_ui in content:
    content = content.replace(old_ui, new_ui)
    print('Step 1 OK: added THEME_KEY')
else:
    print('WARN: UI_KEY not found, searching...')
    idx = content.find('UI_KEY')
    if idx >= 0:
        print('Found UI_KEY at', idx, ':', repr(content[idx:idx+60]))
    else:
        print('UI_KEY not found at all!')

# 2. Add loadTheme and applyTheme functions after loadUI()
old_loadui = """function loadUI() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (_) { return {}; }
}"""
new_loadui = """function loadUI() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (_) { return {}; }
}
function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) { return 'dark'; }
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌓';
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
}"""
if old_loadui in content:
    content = content.replace(old_loadui, new_loadui)
    print('Step 2 OK: added theme functions')
else:
    print('WARN: loadUI function not matched')

# 3. Add theme init to boot() function, after loadUI() call
# Find: state.sideHidden = loadUI().sideHidden === true; applySide();
old_boot = "state.sideHidden = loadUI().sideHidden === true; applySide();"
new_boot = "state.sideHidden = loadUI().sideHidden === true; applySide();\n  applyTheme(loadTheme());"
if old_boot in content:
    content = content.replace(old_boot, new_boot)
    print('Step 3 OK: added applyTheme to boot()')
else:
    print('WARN: boot theme init not matched')

# 4. Add event listener for theme button
# Add after the existing viewbar click handler
old_viewbar = """$('#viewbar').addEventListener('click', e => {
  if (e.target.closest('#btn-side')) { toggleSide(); return; }
  const b = e.target.closest('.seg-btn');
  if (b) setView(b.dataset.view);
});"""
new_viewbar = """$('#viewbar').addEventListener('click', e => {
  if (e.target.closest('#btn-theme')) { toggleTheme(); return; }
  if (e.target.closest('#btn-side')) { toggleSide(); return; }
  const b = e.target.closest('.seg-btn');
  if (b) setView(b.dataset.view);
});"""
if old_viewbar in content:
    content = content.replace(old_viewbar, new_viewbar)
    print('Step 4 OK: added theme button handler')
else:
    print('WARN: viewbar handler not matched')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('app.js updated successfully')