#!/usr/bin/env bash
# Run every audit acceptance check on the current dev build; prints "<check>: <item>=<pass> …" lines.  (run from game/)
cd "$(dirname "$0")/.."
summ() { python3 -c "
import sys,json
t=sys.stdin.read(); out=[]
for line in t.splitlines():
    s=line[line.find('{'):] if '{' in line else ''
    try: o=json.loads(s)
    except Exception: continue
    it=o.get('items') if isinstance(o,dict) else None
    if isinstance(it,dict): out.append(' '.join(f'{k}={(v.get(\"pass\") if isinstance(v,dict) else v)}' for k,v in it.items()))
print(out[-1] if out else 'NO RESULT: '+t.strip()[-300:].replace(chr(10),' | '))"; }
inpage() { node tools/shot.cjs "/harness/harness.html?m=$1&test=1" --quiet --until "window.__harness && (window.__harness.ready || window.__harness.error)" --print "window.__harness.error || await window.__harness.api.run()" 2>&1; }
for m in accept_lead accept_review accept_fx_combat accept_state accept_camera; do echo "$m: $(timeout 1500 bash -c "$(declare -f inpage); inpage $m" | summ)"; done
for s in accept_fx_chars accept_input accept_water accept_fx_combat accept_state; do echo "$s.cjs: $(timeout 1500 node tools/$s.cjs 2>/dev/null | summ)"; done
