import sys

filepath = '/Users/Banner/Documents/guomengtao/ev/evdb/public/style.css'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add --null and --json vars and light theme block
old_root_end = '--flash-col: rgba(94, 157, 249, .22); --flash-row: rgba(78, 204, 163, .14);\n}'
new_root_end = '''--flash-col: rgba(94, 157, 249, .22); --flash-row: rgba(78, 204, 163, .14);
  --null: #5c6572; --json: #c9a0ff;
}

/* ========== 亮色主题（白） ========== */
[data-theme="light"] {
  --bg: #f5f5f7; --panel: #ffffff; --panel2: #ecedf0; --line: #d1d1d6;
  --txt: #1d1d1f; --dim: #6e6e73; --acc: #0071e3; --ok: #34c759; --warn: #ff9500;
  --flash-col: rgba(0, 113, 227, .15); --flash-row: rgba(52, 199, 89, .12);
  --null: #8e8e93; --json: #8944ab;
}
[data-theme="light"] body { background: var(--bg); color: var(--txt); }
[data-theme="light"] .t-tip { background: rgba(255, 255, 255, .97); color: #1d1d1f; }
[data-theme="light"] .t-tip .tt-cn { color: #1d1d1f; }
[data-theme="light"] .t-tip .tt-k { color: #6e6e73; }
[data-theme="light"] .t-tip .tt-v { color: #3a3a3c; }
[data-theme="light"] .tab.active { color: #1d1d1f; }
[data-theme="light"] .seg-btn.active { color: #1d1d1f; }
'''
if old_root_end in content:
    content = content.replace(old_root_end, new_root_end)
    print('Step 1 OK: added light theme vars')
else:
    print('ERROR: old_root_end not found!')
    sys.exit(1)

# 2. Replace hardcoded null/json colors with CSS variables
replacements = [
    ('td .null { color: #5c6572; font-style: italic; }', 'td .null { color: var(--null); font-style: italic; }'),
    ('td .json { color: #c9a0ff; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }', 'td .json { color: var(--json); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }'),
    ('table.ct .null { color: #5c6572; font-style: italic; }', 'table.ct .null { color: var(--null); font-style: italic; }'),
    ('table.ct .json { color: #c9a0ff; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10px; }', 'table.ct .json { color: var(--json); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10px; }'),
]
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print('Replaced:', old[:50])
    else:
        print('WARN: not found:', old[:50])

# 3. Add theme toggle button style at the end
theme_btn_css = '''
/* ---------- 主题切换按钮 ---------- */
#btn-theme { background: none; border: 1px solid var(--line); color: var(--dim); border-radius: 6px; padding: 3px 9px; cursor: pointer; font-size: 14px; line-height: 1; }
#btn-theme:hover { color: var(--txt); border-color: var(--acc); }
'''
content += theme_btn_css

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('style.css updated successfully')