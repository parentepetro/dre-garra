#!/usr/bin/env node
/**
 * DESCOBERTA — onde estao as taxas de cartao no Imex.
 *
 * Elas aparecem na DRE do Imex mas nao chegam no painel. Este script procura
 * em tres frentes:
 *
 *   1. varre as combinacoes de tipoConta / vinculado do contas a pagar
 *      (hoje o robo so pede tipoConta 0 e vinculado 0 — pode ser so isso)
 *   2. lista as contas do plano que tem cara de taxa / cartao / financeira
 *   3. pergunta ao proprio servidor quais consultas existem com cara de
 *      DRE, resultado ou conciliadora
 *
 * NAO grava nada. So le e mostra.
 *
 *   node descobrir-taxas.cjs            -> mes de agosto/2026
 *   node descobrir-taxas.cjs 2026-08-01 2026-08-31
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

const INI = process.argv[2] || '2026-08-01';
const FIM = process.argv[3] || '2026-08-31';

const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const log = (...a) => console.log(...a);
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
      ERP = url; log(`servidor do Imex: ${url}\n`); return;
    } catch {}
  }
  throw new Error('nenhum endereco do Imex respondeu');
}

const Q_CP = `query cp($filial:[Float!]!,$tipoConta:Float!,$vinculado:Float!,$dataInicial:String!,
  $dataFinal:String!,$usarPeriodo:Boolean!,$tipoData:Float!,$page:Float,$offset:Float){
  getContasPagar(filial:$filial,tipoConta:$tipoConta,vinculado:$vinculado,dataInicial:$dataInicial,
    dataFinal:$dataFinal,usarPeriodo:$usarPeriodo,tipoData:$tipoData,page:$page,offset:$offset){
    idContasPagar idPlanoDeContas nomeEntidade historico dtaContaBr valor documento } }`;

const Q_PLANO = `query pc($idFilial:Float!,$_limit:Int!,$_offset:Int!){
  planosDeContas(idFilial:$idFilial,_limit:$_limit,_offset:$_offset){
    idPlanoDeContas codigoPlanoDeContas nomePlanoDeContas } }`;

const ALVO = /(taxa|tarifa|cart[aã]o|cielo|rede|getnet|stone|sipag|vero|adquir|bandeira|administradora|antecipa|financeir)/i;

(async () => {
  try {
    await escolherServidor();

    const d = await gql(`mutation login($usuario:String!,$senha:String!){
      login(usuario:$usuario,senha:$senha){ token payload{id} usuario{idUsuarios nomeUsuarios} } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false);
    TOKEN = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    log(`conectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario}`);
    log(`periodo analisado: ${INI} a ${FIM}\n`);

    // ---------- plano de contas ----------
    const mapa = {};
    for (let off = 0; off < 4000; off += 500) {
      const p = await gql(Q_PLANO, { idFilial: FILIAL, _limit: 500, _offset: off });
      const l = p.planosDeContas || [];
      l.forEach(c => mapa[c.idPlanoDeContas] = { cod: c.codigoPlanoDeContas, nome: c.nomePlanoDeContas });
      if (l.length < 500) break;
    }

    log('='.repeat(78));
    log('  1. CONTAS DO PLANO COM CARA DE TAXA / CARTAO / FINANCEIRA');
    log('='.repeat(78));
    const suspeitas = Object.entries(mapa).filter(([, c]) => ALVO.test(c.nome || ''));
    if (!suspeitas.length) log('    nenhuma encontrada (?!)');
    suspeitas.sort((a, b) => String(a[1].cod).localeCompare(String(b[1].cod)))
      .forEach(([id, c]) => log(`    id ${String(id).padStart(6)}  ${String(c.cod).padEnd(14)} ${c.nome}`));

    // ---------- varredura tipoConta x vinculado ----------
    log('\n' + '='.repeat(78));
    log('  2. VARREDURA DO CONTAS A PAGAR — tipoConta x vinculado');
    log('     (hoje o robo usa tipoConta 0 / vinculado 0)');
    log('='.repeat(78));

    const achados = [];
    for (const tipoConta of [0, 1, 2, 3]) {
      for (const vinculado of [0, 1, 2]) {
        try {
          const r = await gql(Q_CP, {
            filial: [FILIAL], tipoConta, vinculado,
            dataInicial: INI, dataFinal: FIM, usarPeriodo: true, tipoData: 0,
            page: 1, offset: 100000,
          });
          const l = r.getContasPagar || [];
          const soma = l.reduce((a, x) => a + Number(x.valor || 0), 0);
          const comTaxa = l.filter(x => {
            const c = mapa[x.idPlanoDeContas] || {};
            return ALVO.test(c.nome || '') || ALVO.test(x.nomeEntidade || '') || ALVO.test(x.historico || '');
          });
          const marca = comTaxa.length ? ' <<< TEM TAXA AQUI' : '';
          log(`    tipoConta ${tipoConta} · vinculado ${vinculado}  ->  ${String(l.length).padStart(5)} lanc · ${brl(soma).padStart(18)}${marca}`);
          if (comTaxa.length) {
            achados.push({ tipoConta, vinculado, comTaxa });
            const porConta = {};
            comTaxa.forEach(x => {
              const c = mapa[x.idPlanoDeContas] || {};
              const k = `${c.cod || '?'} ${c.nome || '?'}`;
              porConta[k] = (porConta[k] || 0) + Number(x.valor || 0);
            });
            Object.entries(porConta).sort((a, b) => b[1] - a[1]).slice(0, 8)
              .forEach(([k, v]) => log(`          ${k.slice(0, 50).padEnd(51)} ${brl(v).padStart(16)}`));
          }
        } catch (e) {
          log(`    tipoConta ${tipoConta} · vinculado ${vinculado}  ->  ERRO: ${e.message.slice(0, 90)}`);
        }
      }
    }

    if (achados.length) {
      log('\n    AMOSTRA dos lancamentos de taxa encontrados:');
      achados[0].comTaxa.slice(0, 8).forEach(x => {
        const c = mapa[x.idPlanoDeContas] || {};
        log(`      ${x.dtaContaBr}  ${brl(x.valor).padStart(13)}  ${String(c.cod||'').padEnd(12)} ${String(c.nome||'').slice(0,26).padEnd(27)} ${String(x.nomeEntidade||'').slice(0,24)}`);
      });
    }

    // ---------- o que mais o servidor oferece ----------
    log('\n' + '='.repeat(78));
    log('  3. CONSULTAS DISPONIVEIS NO SERVIDOR COM CARA DE DRE / TAXA / CONCILIACAO');
    log('='.repeat(78));
    try {
      const intro = await gql(`{ __schema { queryType { fields { name args { name type { name kind ofType { name kind } } } } } } }`);
      const campos = intro.__schema.queryType.fields || [];
      const re = /(dre|resultado|demonstrativo|demonstracao|taxa|cartao|cart[aã]o|conciliad|adquir|financeir|apurac|balanc|razao|contabil|lancamento)/i;
      const bons = campos.filter(f => re.test(f.name));
      log(`    ${campos.length} consultas no total, ${bons.length} com cara de ser o que a gente quer:\n`);
      bons.forEach(f => {
        const args = (f.args || []).map(a => {
          const t = a.type?.name || a.type?.ofType?.name || a.type?.kind;
          return `${a.name}: ${t}`;
        }).join(', ');
        log(`      ${f.name}(${args})`);
      });
    } catch (e) {
      log(`    nao consegui listar (introspeccao desligada?): ${e.message.slice(0, 120)}`);
    }

    log('\n  Copie tudo isso e me mande.\n');

  } catch (e) {
    console.error('\nERRO:', e.message, '\n');
    process.exit(1);
  }
})();
