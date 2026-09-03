#!/usr/bin/env node
/**
 * AUDITORIA — saidas do Posto Garra para as outras empresas da rede.
 *
 * Le o contas a pagar COMPLETO do Imex (inclusive as contas que ficam de fora
 * da DRE, como compra de combustivel e conta patrimonial — que e justamente
 * onde as transferencias entre empresas costumam estar).
 *
 * NAO grava nada em lugar nenhum. So le, mostra na tela e salva um CSV.
 *
 *   node auditoria-saidas.cjs                 -> de 01/05 ate hoje
 *   node auditoria-saidas.cjs 2026-05-01 2026-09-30
 */

const fs   = require('fs');
const path = require('path');

const CFG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CFG_PATH)) { console.error('\n  Falta o config.json nesta pasta.\n'); process.exit(1); }
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const FILIAL = Number(CFG.filial);
const MATRIZ = Number(CFG.matriz);
const limpar = u => String(u || '').replace(/\/+$/, '');
const CANDIDATOS = [process.env.ERP_URL, CFG.erp_url, CFG.erp_url_externo || 'http://redeparente.ddns.com.br:4000']
  .map(limpar).filter((u, i, a) => u && a.indexOf(u) === i);
let ERP = CANDIDATOS[0];

const hoje = new Date();
const iso  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const INI  = process.argv[2] || '2026-05-01';
const FIM  = process.argv[3] || iso(hoje);

const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const log = (...a) => console.log(...a);

/* ---- quem e "empresa da rede" ------------------------------------------
   Se algum nome estiver faltando, e so acrescentar aqui embaixo.          */
const REDE = /(parente|posto *garra|garra *combust|melo *e *lob|melo *& *lob|posto *kj|vermelha|posto *avenida|juazeiro|veriato|davi *caldas|casa *nova|pit *stop|ara[uú]jo)/i;

let TOKEN = null, X_USER = null;

async function gql(query, variables = {}, comAuth = true) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) Object.assign(headers, {
    authorization: `Bearer ${TOKEN}`, 'x-filial': String(FILIAL),
    'x-matriz': String(MATRIZ), 'x-user': String(X_USER ?? ''),
    'x-serial-terminal': 'RETAGUARDA',
  });
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

async function escolherServidor() {
  for (const url of CANDIDATOS) {
    try {
      await fetch(`${url}/graphql`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query:'{__typename}' }), signal: AbortSignal.timeout(8000) });
      ERP = url; log(`servidor do Imex: ${url}`); return;
    } catch {}
  }
  throw new Error('nenhum endereco do Imex respondeu');
}

const Q_CONTAS_PAGAR = `query cp($filial:[Float!]!,$tipoConta:Float!,$vinculado:Float!,$dataInicial:String!,
  $dataFinal:String!,$usarPeriodo:Boolean!,$tipoData:Float!,$page:Float,$offset:Float){
  getContasPagar(filial:$filial,tipoConta:$tipoConta,vinculado:$vinculado,dataInicial:$dataInicial,
    dataFinal:$dataFinal,usarPeriodo:$usarPeriodo,tipoData:$tipoData,page:$page,offset:$offset){
    idContasPagar idPlanoDeContas nomeEntidade historico dtaContaBr valor documento } }`;

const Q_PLANO = `query pc($idFilial:Float!,$_limit:Int!,$_offset:Int!){
  planosDeContas(idFilial:$idFilial,_limit:$_limit,_offset:$_offset){
    idPlanoDeContas codigoPlanoDeContas nomePlanoDeContas } }`;

(async () => {
  try {
    await escolherServidor();

    const d = await gql(`mutation login($usuario:String!,$senha:String!){
      login(usuario:$usuario,senha:$senha){ token payload{id} usuario{idUsuarios nomeUsuarios} } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false);
    TOKEN = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    log(`conectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario}\n`);

    // plano de contas, para nomear cada lancamento
    const mapa = {};
    for (let off = 0; off < 4000; off += 500) {
      const p = await gql(Q_PLANO, { idFilial: FILIAL, _limit: 500, _offset: off });
      const l = p.planosDeContas || [];
      l.forEach(c => mapa[c.idPlanoDeContas] = {
        cod: c.codigoPlanoDeContas, nome: c.nomePlanoDeContas });
      if (l.length < 500) break;
    }
    log(`plano de contas: ${Object.keys(mapa).length} contas`);

    // contas a pagar do periodo, mes a mes (a consulta nao gosta de janela longa)
    const todos = [];
    let cursor = new Date(INI + 'T00:00:00');
    const fimD = new Date(FIM + 'T00:00:00');
    while (cursor <= fimD) {
      const ini = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const fmA = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const a = iso(ini) < INI ? INI : iso(ini);
      const b = iso(fmA) > FIM ? FIM : iso(fmA);
      const r = await gql(Q_CONTAS_PAGAR, {
        filial: [FILIAL], tipoConta: 0, vinculado: 0,
        dataInicial: a, dataFinal: b, usarPeriodo: true, tipoData: 0,
        page: 1, offset: 100000,
      });
      const l = r.getContasPagar || [];
      log(`  ${a} a ${b}: ${l.length} lancamento(s)`);
      todos.push(...l);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const linhas = todos.map(t => {
      const c = mapa[t.idPlanoDeContas] || {};
      return {
        id: t.idContasPagar,
        data: t.dtaContaBr,
        entidade: (t.nomeEntidade || '').trim(),
        historico: (t.historico || '').trim(),
        conta_cod: c.cod || '',
        conta_nome: c.nome || '',
        documento: t.documento || '',
        valor: Number(t.valor || 0),
      };
    });

    const total = linhas.reduce((a, l) => a + l.valor, 0);
    log(`\nTOTAL do contas a pagar no periodo: ${linhas.length} lancamentos · ${brl(total)}\n`);

    // ---- 1. quem e da rede
    const daRede = linhas.filter(l => REDE.test(l.entidade));
    const somaRede = daRede.reduce((a, l) => a + l.valor, 0);

    log('='.repeat(78));
    log(`  SAIDAS PARA EMPRESAS DA REDE — ${daRede.length} lancamentos · ${brl(somaRede)}`);
    log(`  (${(somaRede / total * 100).toFixed(1)}% de tudo que o Garra deve/pagou no periodo)`);
    log('='.repeat(78));

    const porEnt = {};
    daRede.forEach(l => {
      const k = l.entidade;
      if (!porEnt[k]) porEnt[k] = { n: 0, v: 0, contas: {} };
      porEnt[k].n++; porEnt[k].v += l.valor;
      const ck = `${l.conta_cod} ${l.conta_nome}`;
      porEnt[k].contas[ck] = (porEnt[k].contas[ck] || 0) + l.valor;
    });

    Object.entries(porEnt).sort((a, b) => b[1].v - a[1].v).forEach(([k, v]) => {
      log(`\n  ${k}`);
      log(`    ${String(v.n).padStart(4)} lancamento(s) · ${brl(v.v)}`);
      Object.entries(v.contas).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .forEach(([c, x]) => log(`         ${c.slice(0, 52).padEnd(53)} ${brl(x).padStart(16)}`));
    });

    // ---- 2. mes a mes
    log('\n' + '='.repeat(78));
    log('  MES A MES (so empresas da rede)');
    log('='.repeat(78));
    const porMes = {};
    daRede.forEach(l => {
      const m = (l.data || '').slice(3);  // dd/mm/aaaa -> mm/aaaa
      porMes[m] = (porMes[m] || 0) + l.valor;
    });
    Object.entries(porMes).sort().forEach(([m, v]) => log(`    ${m}   ${brl(v).padStart(18)}`));

    // ---- 3. os 25 maiores, um a um
    log('\n' + '='.repeat(78));
    log('  OS 25 MAIORES LANCAMENTOS PARA A REDE');
    log('='.repeat(78));
    daRede.sort((a, b) => b.valor - a.valor).slice(0, 25).forEach(l => log(
      `    ${l.data}  ${brl(l.valor).padStart(15)}  ${l.entidade.slice(0, 28).padEnd(29)} ${l.conta_nome.slice(0, 24)}`));

    // ---- 4. rede completa de fornecedores, pra voce conferir se faltou alguem
    log('\n' + '='.repeat(78));
    log('  TODOS OS FORNECEDORES DO PERIODO (top 40) — confira se falta alguem na lista da rede');
    log('='.repeat(78));
    const porTodos = {};
    linhas.forEach(l => { porTodos[l.entidade] = (porTodos[l.entidade] || 0) + l.valor; });
    Object.entries(porTodos).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) =>
      log(`    ${REDE.test(k) ? '>>' : '  '} ${k.slice(0, 44).padEnd(45)} ${brl(v).padStart(18)}`));

    // ---- CSV
    const csv = ['data;entidade;da_rede;conta_codigo;conta_nome;documento;historico;valor']
      .concat(linhas.map(l => [
        l.data, l.entidade, REDE.test(l.entidade) ? 'SIM' : '', l.conta_cod, l.conta_nome,
        l.documento, l.historico.replace(/[;\n\r]/g, ' '),
        l.valor.toFixed(2).replace('.', ','),
      ].join(';')));
    const saida = path.join(__dirname, `auditoria-saidas-${INI}-a-${FIM}.csv`);
    fs.writeFileSync(saida, '﻿' + csv.join('\n'), 'utf8');
    log(`\n  CSV completo salvo em:\n  ${saida}\n`);

  } catch (e) {
    console.error('\nERRO:', e.message, '\n');
    process.exit(1);
  }
})();
