#!/bin/bash
# Baixa a versao mais recente do robo direto do GitHub.
cd "$(dirname "$0")" || exit 1
echo "Atualizando o robo..."
for f in sync.cjs dre-imex.cjs auditoria-saidas.cjs descobrir-taxas.cjs detalhar-conta.cjs instalar.command README.md; do
  curl -fsSL -o "$f" "https://raw.githubusercontent.com/parentepetro/dre-garra/main/robo-imex/$f" \
    && echo "  ok  $f" || echo "  X   falhou: $f"
done
chmod +x instalar.command 2>/dev/null
echo
echo "Pronto. Seu config.json nao foi tocado."
read -n 1 -s -r -p "Pressione qualquer tecla para fechar."
