#!/usr/bin/env node
/**
 * Descoberta dos filtros de CONTAS A RECEBER do Imex/XPert.
 *
 * Roda numa maquina que enxergue o Imex e imprime:
 *   - quais codigos de "situacao" existem (para achar o "em aberto")
 *   - qual "tipoData" filtra pela DATA DA CONTA e qual filtra pelo VENCIMENTO
 *   - uma amostra dos titulos, para conferir os campos
 *
 * Nao grava nada, em lugar nenhum. So lê e mostra.
 *
 *   node descobrir-receber.cjs
 */

const fs   = require('fs');
const path = require('path');

const CFG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CFG_PATH)) {
  console.error('\n  Falta o config.json nesta pasta (o mesmo do robo).\n');
  process.exit(1);
}
const CFG    = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const ERP    = (process.env.ERP_URL || CFG.erp_url).replace(/\/+$/, '');
const FILIAL = Number(CFG.filial);
const MATRIZ = Number(CFG.matriz);

let TOKEN = null, X_USER = null;

async function gql(query, variables = {}, comAuth = true) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) Object.assign(headers, {
    authorization: `Bearer ${TOKEN}`,
    'x-filial': String(FILIAL), 'x-matriz': String(MATRIZ),
    'x-user': String(X_USER ?? ''), 'x-serial-terminal': 'RETAGUARDA'
  });
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const CAMPOS = `idContasReceber idEntidade nomeEntidade cnpjCpf dtaContaBr dtaVctoBr dtaPgtoBr
  valor vlrPago pagar nroDoc historico idSituacoes descricaoSituacao nroPlaca observacoes`;

async function buscar(params) {
  const d = await gql(
    `query g($p: ParamsGerenciarContasReceber!){ getGerenciamentoContasReceber(paramsContaReceber: $p){ ${CAMPOS} } }`,
    { p: params }
  );
  return d.getGerenciamentoContasReceber || [];
}

(async () => {
  try {
    // ---------- login ----------
    const d = await gql(
      `mutation login($usuario:String!,$senha:String!){
         login(usuario:$usuario,senha:$senha){ token payload { id nomeUsuario } usuario { idUsuarios nomeUsuarios } } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false
    );
    TOKEN  = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    console.log(`\nconectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario} · filial ${FILIAL}\n`);

    // ---------- 1. tudo, sem filtro de situacao ----------
    console.log('== 1. TODOS OS TITULOS (sem filtro de situacao) ==');
    let todos = [];
    const base = { idFilial: FILIAL, idFiliais: FILIAL, todosRegistros: true };
    for (const tentativa of [
      { ...base },
      { ...base, situacao: 0 },
      { ...base, tipoStatus: 0 },
      { idFilial: FILIAL, todosRegistros: true, dtaInicial: '2026-01-01', dtaFinal: '2026-12-31', tipoData: 1 },
    ]) {
      try {
        const r = await buscar(tentativa);
        console.log(`  ${JSON.stringify(tentativa)} -> ${r.length} titulo(s)`);
        if (r.length > todos.length) todos = r;
      } catch (e) {
        console.log(`  ${JSON.stringify(tentativa)} -> ERRO: ${e.message.slice(0,400)}`);
      }
    }

    if (!todos.length) {
      console.log('\n  Nenhum titulo voltou. Pode ser que o Garra nao tenha contas a receber,');
      console.log('  ou que os parametros precisem de outro formato. Me mande esta saida.\n');
      return;
    }

    // ---------- 2. situacoes existentes ----------
    console.log('\n== 2. SITUACOES ENCONTRADAS (o codigo de "em aberto" esta aqui) ==');
    const sit = {};
    todos.forEach(t => {
      const k = `${t.idSituacoes} = ${t.descricaoSituacao}`;
      if (!sit[k]) sit[k] = { n:0, valor:0, saldo:0 };
      sit[k].n++; sit[k].valor += Number(t.valor||0); sit[k].saldo += Number(t.pagar||0);
    });
    Object.entries(sit).sort((a,b)=>b[1].saldo-a[1].saldo).forEach(([k,v]) =>
      console.log(`  ${k.padEnd(34)} ${String(v.n).padStart(5)} titulo(s) · valor ${brl(v.valor)} · saldo ${brl(v.saldo)}`));

    // ---------- 3. qual tipoData e a data da conta ----------
    console.log('\n== 3. TIPO DE DATA (qual numero filtra pela DATA DA CONTA) ==');
    const ini = '2026-08-01', fim = '2026-08-31';
    for (const td of [0,1,2,3]) {
      try {
        const r = await buscar({ idFilial: FILIAL, todosRegistros: true, dtaInicial: ini, dtaFinal: fim, tipoData: td });
        const dentroConta = r.filter(x => (x.dtaContaBr||'').slice(3,10) === '08/2026').length;
        const dentroVcto  = r.filter(x => (x.dtaVctoBr ||'').slice(3,10) === '08/2026').length;
        console.log(`  tipoData ${td}: ${String(r.length).padStart(4)} titulo(s) · ${dentroConta} com DATA DA CONTA em ago · ${dentroVcto} com VENCIMENTO em ago`);
      } catch (e) {
        console.log(`  tipoData ${td}: ERRO ${e.message.slice(0,300)}`);
      }
    }

    // ---------- 4. amostra ----------
    console.log('\n== 4. AMOSTRA (5 maiores saldos em aberto) ==');
    todos.filter(t => Number(t.pagar||0) > 0)
      .sort((a,b)=>Number(b.pagar)-Number(a.pagar)).slice(0,5)
      .forEach(t => console.log(
        `  ${(t.dtaContaBr||'?').padEnd(11)} vcto ${(t.dtaVctoBr||'?').padEnd(11)} ` +
        `${String(t.nomeEntidade||'?').slice(0,28).padEnd(29)} ` +
        `valor ${brl(t.valor).padStart(15)} · pago ${brl(t.vlrPago).padStart(13)} · saldo ${brl(t.pagar).padStart(15)} · ${t.descricaoSituacao||''}`));

    const abertos = todos.filter(t => Number(t.pagar||0) > 0);
    console.log(`\n  TOTAL EM ABERTO (saldo > 0): ${abertos.length} titulo(s) · ${brl(abertos.reduce((a,t)=>a+Number(t.pagar||0),0))}`);
    console.log('\n  Copie esta saida e me mande.\n');

  } catch (e) {
    console.error('\nERRO:', e.message, '\n');
    process.exit(1);
  }
})();
