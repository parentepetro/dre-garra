#!/usr/bin/env node
/**
 * Robô de sincronização Imex/XPert → DRE Posto Parente Garra
 *
 * Lê as vendas e o contas a pagar do ERP e envia para o painel.
 * Roda em qualquer máquina que enxergue o servidor do Imex (10.1.0.201).
 *
 *   node sync.js              → sincroniza mês atual + mês anterior
 *   node sync.js --meses 6    → últimos 6 meses
 *   node sync.js --teste      → só mostra o que faria, não grava nada
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------- config
const CFG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error('\n  Falta o arquivo config.json.');
  console.error('  Copie config.exemplo.json para config.json e preencha usuário e senha do Imex.\n');
  process.exit(1);
}
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const args    = process.argv.slice(2);
const TESTE   = args.includes('--teste');
const iMeses  = args.indexOf('--meses');
const N_MESES = iMeses >= 0 ? Math.max(1, parseInt(args[iMeses + 1], 10) || 2) : 2;

const ERP     = CFG.erp_url.replace(/\/+$/, '');
const FILIAL  = Number(CFG.filial);
const MATRIZ  = Number(CFG.matriz);

// ---------------------------------------------------------------- utilitários
const log = (...a) => console.log(new Date().toLocaleString('pt-BR'), '·', ...a);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

function meses(n) {
  const out = [];
  const hoje = new Date();
  for (let i = 0; i < n; i++) {
    const d   = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ini = new Date(d.getFullYear(), d.getMonth(), 1);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    // o mês corrente para no dia de hoje
    const fimReal = (i === 0) ? hoje : fim;
    out.push({ competencia: iso(ini), ini: iso(ini), fim: iso(fimReal), parcial: i === 0 });
  }
  return out.reverse();
}

let TOKEN = null, X_USER = null;

async function gql(query, variables = {}, comAuth = true) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) {
    headers['authorization']      = `Bearer ${TOKEN}`;
    headers['x-filial']           = String(FILIAL);
    headers['x-matriz']           = String(MATRIZ);
    headers['x-user']             = String(X_USER ?? '');
    headers['x-serial-terminal']  = 'RETAGUARDA';
  }
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

// ---------------------------------------------------------------- ERP
async function entrar() {
  const d = await gql(
    `mutation login($usuario:String!,$senha:String!){
       login(usuario:$usuario,senha:$senha){
         token
         payload { id nomeUsuario idFilial }
         usuario { idUsuarios nomeUsuarios idFilial }
       } }`,
    { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false
  );
  if (!d?.login?.token) throw new Error('Imex nao devolveu token — confira usuario e senha no config.json');
  TOKEN  = d.login.token;
  X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? CFG.x_user ?? '';
  log(`conectado ao Imex como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario} (id ${X_USER})`);
}

const Q_VENDAS = `query v($a:String!,$b:String!,$f:[Int!]!){
  c: dashboardCombustivelVendasTotal(dataIni:$a,dataFim:$b,arrFilial:$f){ qtde faturamento custo }
  p: dashboardPistaVendasTotal(dataIni:$a,dataFim:$b,arrFilial:$f){ qtde faturamento custo }
}`;

const Q_CONTAS_PAGAR = `query cp($filial:[Float!]!,$tipoConta:Float!,$vinculado:Float!,$dataInicial:String!,
  $dataFinal:String!,$usarPeriodo:Boolean!,$tipoData:Float!,$page:Float,$offset:Float){
  getContasPagar(filial:$filial,tipoConta:$tipoConta,vinculado:$vinculado,dataInicial:$dataInicial,
    dataFinal:$dataFinal,usarPeriodo:$usarPeriodo,tipoData:$tipoData,page:$page,offset:$offset){
    idContasPagar idPlanoDeContas nomeEntidade historico dtaContaBr valor documento } }`;

const Q_PLANO = `query pc($idFilial:Float!,$_limit:Int!,$_offset:Int!){
  planosDeContas(idFilial:$idFilial,_limit:$_limit,_offset:$_offset){
    idPlanoDeContas codigoPlanoDeContas nomePlanoDeContas } }`;

async function planoDeContas() {
  const d = await gql(Q_PLANO, { idFilial: FILIAL, _limit: 3000, _offset: 0 });
  const m = {};
  for (const p of d.planosDeContas) m[p.idPlanoDeContas] = [p.codigoPlanoDeContas, p.nomePlanoDeContas];
  log(`plano de contas: ${Object.keys(m).length} contas`);
  return m;
}

// ---------------------------------------------------------------- painel
async function enviar(tipo, rows) {
  if (!rows.length) return { gravados: 0 };
  if (TESTE) { log(`[teste] enviaria ${rows.length} registro(s) de ${tipo}`); return { gravados: 0, teste: true }; }
  const r = await fetch(CFG.painel_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-token': CFG.painel_token },
    body: JSON.stringify({ tipo, rows })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`painel respondeu ${r.status}: ${j.error || 'erro'}`);
  return j;
}

// ---------------------------------------------------------------- principal
(async () => {
  try {
    await entrar();
    const mapa   = await planoDeContas();
    const lista  = meses(N_MESES);
    log(`sincronizando ${lista.length} mês(es): ${lista.map(m => m.competencia.slice(0,7)).join(', ')}`);

    // ---- vendas
    const vendas = [];
    for (const m of lista) {
      const d = await gql(Q_VENDAS, { a: m.ini, b: m.fim, f: [FILIAL] });
      const obs = `Imex/XPert · filial ${FILIAL} · ${m.competencia.slice(0,7)}${m.parcial ? ` (parcial ate ${m.fim})` : ''}`;
      if (d.c) vendas.push({ competencia:m.competencia, segmento:'combustiveis',
        faturamento_bruto:+d.c.faturamento.toFixed(2), custo_mercadoria:+d.c.custo.toFixed(2),
        volume_litros:+d.c.qtde.toFixed(2), observacoes:obs });
      if (d.p) vendas.push({ competencia:m.competencia, segmento:'conveniencia',
        faturamento_bruto:+d.p.faturamento.toFixed(2), custo_mercadoria:+d.p.custo.toFixed(2),
        volume_litros:+d.p.qtde.toFixed(2), observacoes:obs + ' (pista/loja)' });
      const lb = (d.c?.faturamento||0)+(d.p?.faturamento||0) - (d.c?.custo||0)-(d.p?.custo||0);
      log(`  ${m.competencia.slice(0,7)}  faturamento ${brl((d.c?.faturamento||0)+(d.p?.faturamento||0))}  ·  lucro bruto ${brl(lb)}`);
    }
    const rv = await enviar('vendas', vendas);
    log(`vendas: ${vendas.length} linha(s) enviada(s)${rv.gravados ? ` · ${rv.gravados} gravada(s)` : ''}`);

    // ---- despesas
    let despesas = [];
    for (const m of lista) {
      const d = await gql(Q_CONTAS_PAGAR, { filial:[FILIAL], tipoConta:0, vinculado:0,
        dataInicial:m.ini, dataFinal:m.fim, usarPeriodo:true, tipoData:0, page:1, offset:20000 });
      const rows = (d.getContasPagar || []).map(x => {
        const [cod, nome] = mapa[x.idPlanoDeContas] || ['?', '?'];
        return { erp_id:x.idContasPagar, filial:FILIAL, data:x.dtaContaBr, conta_codigo:cod,
                 conta_nome:nome, fornecedor:x.nomeEntidade, historico:x.historico, valor:x.valor };
      });
      log(`  ${m.competencia.slice(0,7)}  ${rows.length} lançamento(s) no contas a pagar`);
      despesas = despesas.concat(rows);
    }
    const rd = await enviar('despesas', despesas);
    log(`despesas: ${despesas.length} enviada(s)` +
        (rd.gravados !== undefined ? ` · ${rd.gravados} gravada(s) no DRE · ${rd.ignorados||0} fora do DRE (compra de combustível, conta patrimonial)` : ''));

    log(TESTE ? 'MODO TESTE — nada foi gravado.' : 'sincronização concluída.');
  } catch (e) {
    console.error(new Date().toLocaleString('pt-BR'), '· ERRO:', e.message);
    process.exit(1);
  }
})();
