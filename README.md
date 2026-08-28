# DRE — Posto Parente Garra

Painel de resultado do posto: vendas (integradas ao ERP Imex/XPert), despesas,
aportes, retiradas, conciliação bancária e documentos.

**App no ar:** https://parentepetro.github.io/dre-garra/

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | estrutura e estilos da tela |
| `app.js` | toda a lógica do painel |
| `manifest.webmanifest` | faz o app instalar como ícone no celular |
| `sw.js` | service worker (funciona offline e atualiza sozinho) |
| `icon-*.png` | ícones do app |
| `dre-posto-garra.html` | versão de arquivo único, para abrir sem internet |

Os dados ficam no Supabase (projeto `xqranvotievwkoohsznq`), protegidos por
login e por regras de acesso por linha (RLS).
