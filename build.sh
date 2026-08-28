#!/bin/bash
# Gera dre-posto-garra.html (arquivo unico), versiona o app.js e o cache do service worker.
set -e
cd "$(dirname "$0")"
python3 - <<'PY'
import re, hashlib
js  = open('app.js', encoding='utf-8').read()
ver = hashlib.sha256(js.encode()).hexdigest()[:8]

# 1) index.html publicado aponta para app.js?v=<versao> — mata o cache do navegador
idx = open('index.html', encoding='utf-8').read()
pub = re.sub(r'<script src="app\.js(\?v=[0-9a-f]+)?"></script>',
             f'<script src="app.js?v={ver}"></script>', idx)
open('index.html','w',encoding='utf-8').write(pub)

# 2) service worker com nome de cache novo
sw = open('sw.js', encoding='utf-8').read()
sw = re.sub(r"dre-garra-v[0-9a-zA-Z]+", "dre-garra-v"+ver, sw)
sw = re.sub(r"'\./app\.js(\?v=[0-9a-f]+)?'", f"'./app.js?v={ver}'", sw)
open('sw.js','w',encoding='utf-8').write(sw)

# 3) arquivo unico, para uso offline sem servidor
uni, n = re.subn(r'<script src="app\.js(\?v=[0-9a-f]+)?"></script>',
                 lambda m: '<script>\n' + js.replace('</script>', '<\\/script>') + '\n</script>', pub)
assert n == 1
open('dre-posto-garra.html','w',encoding='utf-8').write(uni)
print('versao', ver)
PY
