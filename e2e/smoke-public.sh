#!/bin/zsh
# Logged-out smoke pass with a throwaway headless Chrome profile.
# Zero-install fallback until Playwright is added: logged-out pages only, using a
# throwaway headless Chrome profile (never your signed-in browser). Needs `npm run dev`.
# usage: e2e/smoke-public.sh <width> <route>...   e.g. e2e/smoke-public.sh 390 / /discover
# Output files go to /tmp/lineup-smoke-<width>.
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W=$1; shift
OUT=/tmp/lineup-smoke-$W; mkdir -p $OUT
for r in "$@"; do
  f=$OUT/$(echo $r | tr '/' '_' ).txt
  P=$(mktemp -d)
  t0=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000')
  "$CH" --headless=new --user-data-dir=$P --no-first-run --disable-gpu --window-size=$W,900 \
    --enable-logging=stderr --v=0 --virtual-time-budget=15000 --timeout=45000 --dump-dom "http://localhost:3000$r" > $f.dom 2> $f.log
  t1=$(perl -MTime::HiRes=time -e 'printf "%d", time*1000')
  rm -rf $P
  text=$(python3 -c "
import re,sys,html
d=open('$f.dom',errors='ignore').read()
d=re.sub(r'(?s)<(script|style|noscript|template)[^>]*>.*?</\1>','',d)
t=html.unescape(re.sub(r'<[^>]+>',' ',d)); t=re.sub(r'\s+',' ',t).strip()
h1=re.search(r'(?s)<h1[^>]*>(.*?)</h1>',d); h1=re.sub(r'<[^>]+>','',h1.group(1)).strip()[:50] if h1 else ''
err='NEXT-ERROR' if ('nextjs-portal' in d or 'Application error' in t or 'Unhandled Runtime Error' in t) else ''
nf='404' if 'could not be found' in t.lower() or 'not found' in h1.lower() else ''
print(f'{len(t)}|{h1}|{err}{nf}')")
  cons=$(grep -E 'CONSOLE|Uncaught' $f.log | grep -viE 'Download the React DevTools|\[HMR\]|\[Fast Refresh\]' | sed -E "s/.*CONSOLE:[0-9]+\] //" | cut -c1-160 | sort -u | head -3 | tr '\n' '¦')
  echo "$r | $((t1-t0))ms | $text | ${cons:-no console errors}"
done
