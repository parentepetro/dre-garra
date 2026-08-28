#!/bin/bash
# Instalador do robo de sincronizacao Imex -> DRE Posto Parente Garra
# Basta dar dois cliques neste arquivo.

cd "$(dirname "$0")" || exit 1
clear
echo "=============================================="
echo "   DRE Posto Parente Garra"
echo "   Instalacao do robo de sincronizacao"
echo "=============================================="
echo

# ---------- 1. Node ----------
if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$p/node" ] && export PATH="$p:$PATH" && break
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "  X  O Node nao esta instalado nesta maquina."
  echo
  echo "     Instale com um destes caminhos e rode este instalador de novo:"
  echo "       - https://nodejs.org  (baixe o instalador LTS e siga o assistente)"
  echo "       - ou, se tiver Homebrew:   brew install node"
  echo
  read -n 1 -s -r -p "Pressione qualquer tecla para fechar."
  exit 1
fi
echo "  ok  Node $(node -v)"

# ---------- 2. acesso ao servidor do Imex ----------
ERP=$(python3 -c "import json;print(json.load(open('config.json'))['erp_url'])" 2>/dev/null || echo "http://10.1.0.201:4000")
if curl -s -o /dev/null --max-time 8 "$ERP/xpertweb/"; then
  echo "  ok  o servidor do Imex responde ($ERP)"
else
  echo "  !   nao consegui falar com o Imex em $ERP"
  echo "      Confira se esta maquina esta na rede do posto. Sigo mesmo assim."
fi

# ---------- 3. credenciais ----------
echo
if [ -f config.json ]; then
  echo "  ok  config.json ja existe — vou manter o que esta la."
else
  echo "  Agora preciso do seu usuario e senha do Imex."
  echo "  Eles ficam guardados SO nesta maquina, no arquivo config.json,"
  echo "  que nunca vai para a internet nem para o GitHub."
  echo
  read -r -p "  Usuario do Imex: " U
  read -r -s -p "  Senha do Imex:   " S; echo
  python3 - "$U" "$S" <<'PY'
import json, sys
cfg = json.load(open('config.exemplo.json'))
cfg.pop('_leia', None)
cfg['imex_usuario'] = sys.argv[1]
cfg['imex_senha']   = sys.argv[2]
json.dump(cfg, open('config.json','w'), indent=2, ensure_ascii=False)
PY
  chmod 600 config.json
  echo "  ok  config.json criado (so voce consegue ler)"
fi

# ---------- 4. teste ----------
echo
echo "  Testando a conexao com o Imex (sem gravar nada)..."
echo "----------------------------------------------"
if ! node sync.cjs --teste; then
  echo "----------------------------------------------"
  echo "  X  o teste falhou. Se a mensagem acima fala de usuario ou senha,"
  echo "     apague o config.json e rode este instalador de novo."
  echo
  read -n 1 -s -r -p "Pressione qualquer tecla para fechar."
  exit 1
fi
echo "----------------------------------------------"
echo "  ok  leitura do Imex funcionando"

# ---------- 5. primeira carga ----------
echo
read -r -p "  Sincronizar agora os ultimos 6 meses? [S/n] " R
if [[ ! "$R" =~ ^[Nn] ]]; then
  node sync.cjs --meses 6 || { echo "  X  falhou na sincronizacao"; read -n 1 -s -r -p "Tecla para fechar."; exit 1; }
fi

# ---------- 6. agendamento ----------
echo
read -r -p "  Deixar rodando sozinho de hora em hora? [S/n] " R
if [[ ! "$R" =~ ^[Nn] ]]; then
  AQUI="$(pwd)"
  NODE="$(command -v node)"
  mkdir -p "$HOME/Library/LaunchAgents"
  PL="$HOME/Library/LaunchAgents/com.postogarra.dre-sync.plist"
  cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.postogarra.dre-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$AQUI/sync.cjs</string>
  </array>
  <key>WorkingDirectory</key><string>$AQUI</string>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$AQUI/sync.log</string>
  <key>StandardErrorPath</key><string>$AQUI/sync.log</string>
</dict>
</plist>
PLIST
  launchctl unload "$PL" 2>/dev/null
  launchctl load "$PL" 2>/dev/null && echo "  ok  agendado: roda a cada 1 hora" \
    || echo "  !   nao consegui agendar. Rode manualmente:  node sync.js"
  echo "      log em: $AQUI/sync.log"
  echo "      para desligar:  launchctl unload \"$PL\""
fi

echo
echo "=============================================="
echo "  Pronto. O painel esta em:"
echo "  https://parentepetro.github.io/dre-garra/"
echo "=============================================="
echo
read -n 1 -s -r -p "Pressione qualquer tecla para fechar."
