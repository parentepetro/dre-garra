# Robô de sincronização Imex → DRE

Lê as vendas e o contas a pagar do Imex/XPert e joga no painel do DRE,
sem ninguém precisar abrir relatório nem digitar nada.

Precisa rodar numa máquina que enxergue o servidor do Imex (`10.1.0.201`) —
o Mac Mini do posto é o lugar natural.

## 1. Instalar

Copie a pasta `robo-imex` para o Mac Mini e configure:

```bash
cd robo-imex
cp config.exemplo.json config.json
open -e config.json          # preencha imex_usuario e imex_senha
```

O `config.json` fica só na máquina — ele está no `.gitignore` e nunca sobe para o GitHub.

## 2. Testar antes de valer

```bash
node sync.js --teste
```

Mostra o que ele leu do Imex e o que gravaria, **sem gravar nada**.
Se os números baterem com o ERP, pode seguir.

## 3. Rodar de verdade

```bash
node sync.js               # mês atual + mês anterior
node sync.js --meses 6     # últimos 6 meses (use na primeira carga)
```

Rodar de novo não duplica: cada lançamento tem o id do Imex, então o painel
atualiza o que mudou e ignora o que já está lá.

## 4. Deixar automático (macOS)

```bash
cp com.postogarra.dre-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.postogarra.dre-sync.plist
```

Passa a rodar sozinho de hora em hora. O log fica em `sync.log`, na mesma pasta.

Para desligar:

```bash
launchctl unload ~/Library/LaunchAgents/com.postogarra.dre-sync.plist
```

## O que ele grava

| Do Imex | Vai para |
|---|---|
| `dashboardCombustivelVendasTotal` | aba Vendas — combustíveis |
| `dashboardPistaVendasTotal` | aba Vendas — loja/pista |
| `getContasPagar` | aba Despesas |

As compras de combustível (`1.1.03.02 ENTRADA ESTOQUE`) e o CMV (`3.1.01`) entram
como custo no lucro bruto e **não** são somados de novo como despesa.
A parcela do caminhão (`2.2.01.01`) entra no DRE como despesa financeira,
conforme vocês decidiram. Essas regras ficam na tabela `erp_contas` do banco —
mudou lá, vale na próxima sincronização.
