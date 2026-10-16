#!/usr/bin/env bash
# ev-mcp 版本号自增脚本（总纲 §3.2 铁律：每次 commit/打包第三位自动 +1，禁手改 VERSION）
# 用法：scripts/bump-version.sh           # v0.0.1 -> v0.0.2
set -euo pipefail
cd "$(dirname "$0")/.."

V_FILE="VERSION"
[ -f "$V_FILE" ] || printf 'v0.0.0\n' > "$V_FILE"

CUR="$(cat "$V_FILE" | tr -d '[:space:]')"
NUM="${CUR#v}"
IFS='.' read -r MA MI PA <<< "$NUM"
: "${MA:?VERSION 格式损坏: $CUR}" "${MI:?}" "${PA:?}"
PA=$((PA + 1))
NEW="v${MA}.${MI}.${PA}"

printf '%s\n' "$NEW" > "$V_FILE"
echo "bump: $CUR -> $NEW"
