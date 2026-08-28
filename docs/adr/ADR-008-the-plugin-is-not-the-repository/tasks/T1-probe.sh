#!/usr/bin/env bash
# ADR-008 T1 — does a `source` subdirectory become the plugin root?
#
# Everything in ADR-008 is contingent on this. Twenty skill and hook references
# resolve through ${CLAUDE_PLUGIN_ROOT}, and no test in this repository can see
# them break: they all run from a checkout where the paths resolve either way.
#
# Answered from a REAL INSTALLED PLUGIN rather than a synthetic probe, which is
# better evidence and touches nothing: any marketplace shipping a plugin whose
# `source` is a subdirectory already demonstrates the behaviour, in production,
# on this machine. Installing a throwaway would have altered the user's plugin
# configuration to learn something already observable.
#
# Exit 0: the subdirectory's CONTENTS are the plugin root — ADR-008 may proceed.
# Exit 1: they are one level down, or nested — ADR-008 must be Withdrawn.
# Exit 2: no such plugin is installed here, so this machine cannot answer.
set -u
root="${HOME}/.claude/plugins"
found=0

for manifest in "$root"/marketplaces/*/.claude-plugin/marketplace.json; do
  [ -f "$manifest" ] || continue
  market="$(basename "$(dirname "$(dirname "$manifest")")")"
  while IFS=$'\t' read -r name source; do
    case "$source" in ''|'.'|'./') continue ;; esac
    case "$source" in *' '*) continue ;; esac
    cached="$(ls -d "$root/cache/$market/$name"/*/ 2>/dev/null | head -1)"
    [ -n "$cached" ] || continue
    found=1
    echo "probe: $market/$name declares source=$source"
    echo "probe: unpacked at $cached"
    # The question, asked two ways.
    if [ -d "${cached}${source#./}" ]; then
      echo "probe: FAIL — the cache still contains '${source#./}', so the plugin root is one level up"
      exit 1
    fi
    if [ ! -f "${cached}.claude-plugin/plugin.json" ]; then
      echo "probe: FAIL — no .claude-plugin/plugin.json at the cache root"
      exit 1
    fi
    echo "probe: PASS — the subdirectory's contents ARE the plugin root"
    echo "probe: claude $(claude --version 2>/dev/null || echo 'version unknown')"
    exit 0
  done < <(python3 -c "
import json,sys
d=json.load(open('$manifest'))
for p in d.get('plugins', []):
    s=p.get('source','.')
    if isinstance(s,str):
        print(p.get('name','?'), s, sep='\t')
" 2>/dev/null)
done

[ "$found" -eq 1 ] || {
  echo "probe: INCONCLUSIVE — no installed plugin declares a subdirectory source on this machine"
  exit 2
}
