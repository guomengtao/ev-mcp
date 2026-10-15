import sys

filepath = '/Users/Banner/Documents/guomengtao/ev/evdb/public/index.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Insert theme toggle button after dash-meta span, before closing </div>
old = '<span id="dash-meta" class="dim"></span>\n    </div>'
new = '<span id="dash-meta" class="dim"></span>\n      <span class="grow"></span>\n      <button id="btn-theme" title="切换亮色/暗色主题">🌓</button>\n    </div>'

if old in content:
    content = content.replace(old, new)
    print('HTML: inserted theme button')
else:
    print('ERROR: old HTML string not found')
    # Debug: find dash-meta
    idx = content.find('dash-meta')
    if idx >= 0:
        print('Found dash-meta at', idx)
        print('Context:', repr(content[idx:idx+80]))
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('index.html updated successfully')