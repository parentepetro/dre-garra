#!/bin/bash
# Escolhe de quanto em quanto tempo o robo roda.
cd "$(dirname "$0")" || exit 1
clear
echo "=============================================="
echo "   Agendamento do robo — DRE Posto Garra"
echo "=============================================="
echo
echo "  1) Uma vez por dia, as 06:00   (recomendado)"
echo "  2) Uma vez por dia, hora que eu escolher"
echo "  3) De hora em hora"
echo "  4) Desligar o agendamento"
echo
read -r -p "  Opcao [1-4]: " OP

PL="$HOME/Library/LaunchAgents/com.postogarra.dre-sync.plist"
launchctl unload "$PL" 2>/dev/null

if [ "$OP" = "4" ]; then
  echo; echo "  ok  agendamento desligado. O robo so roda quando voce mandar."
  read -n 1 -s -r -p "Tecla para fechar."; exit 0
fi

HORA=6
[ "$OP" = "2" ] && read -r -p "  Hora do dia (0 a 23): " HORA
case "$OP" in
  3) QUANDO="  <key>StartInterval</key><integer>3600</integer>" ; DESC="de hora em hora" ;;
  *) QUANDO="  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${HORA}</integer><key>Minute</key><integer>0</integer></dict>"
     DESC="todo dia as ${HORA}:00" ;;
esac

if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$p/node" ] && export PATH="$p:$PATH" && break
  done
fi
AQUI="$(pwd)"; NODE="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.postogarra.dre-sync</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$AQUI/sync.cjs</string></array>
  <key>WorkingDirectory</key><string>$AQUI</string>
$QUANDO
  <key>StandardOutPath</key><string>$AQUI/sync.log</string>
  <key>StandardErrorPath</key><string>$AQUI/sync.log</string>
</dict>
</plist>
PLIST
launchctl load "$PL" 2>/dev/null \
  && echo && echo "  ok  agendado: $DESC" \
  || { echo; echo "  X  nao consegui agendar."; }
echo "      log: $AQUI/sync.log"
echo
read -n 1 -s -r -p "Pressione qualquer tecla para fechar."
