#!/usr/bin/env node
/**
 * Descoberta 2 — CONTAS A RECEBER do Imex/XPert.
 *
 * Ja sabemos que tipoData 0 = DATA DA CONTA.
 * Falta achar qual parametro realmente restringe a filial (o Garra e a 16282).
 * Este script testa varias formas e mostra, em cada uma, DE QUAIS FILIAIS
 * os titulos vieram — assim da para ver na hora se o filtro pegou.
 *
 * Nao grava nada. So le e mostra.
 *
 *   ERP_URL=http://redeparente.ddns.com.br:4000 node descobrir-receber.cjs
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

async function gql(query, variables = {}, comAuth = true, filialHeader = FILIAL) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) Object.assign(headers, {
    authorization: `Bearer ${TOKEN}`,
    'x-filial': String(filialHeader), 'x-matriz': String(MATRIZ),
    'x-user': String(X_USER ?? ''), 'x-serial-terminal': 'RETAGUARDA'
  });
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const CAMPOS = `idContasReceber idFilial nomeFilial idEntidade nomeEntidade cnpjCpf
  dtaContaBr dtaVctoBr valor vlrPago pagar nroDoc historico nroPlaca`;

async function buscar(params, filialHeader) {
  const d = await gql(
    `query g($p: ParamsGerenciarContasReceber!){ getGerenciamentoContasReceber(paramsContaReceber: $p){ ${CAMPOS} } }`,
    { p: params }, true, filialHeader
  );
  return d.getGerenciamentoContasReceber || [];
}

function porFilial(rows) {
  const m = {};
  rows.forEach(r => {
    const k = `${r.idFilial ?? '?'} ${r.nomeFilial ? '· ' + String(r.nomeFilial).slice(0,26) : ''}`;
    if (!m[k]) m[k] = { n:0, saldo:0 };
    m[k].n++; m[k].saldo += Number(r.pagar||0);
  });
  return Object.entries(m).sort((a,b)=>b[1].n-a[1].n);
}

(async () => {
  try {
    const d = await gql(
      `mutation login($usuario:String!,$senha:String!){
         login(usuario:$usuario,senha:$senha){ token payload { id } usuario { idUsuarios nomeUsuarios } } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false
    );
    TOKEN  = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    console.log(`\nconectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario}\n`);

    const DATAS = { dtaInicial:'2026-08-01', dtaFinal:'2026-08-31', tipoData:0 }; // 0 = data da conta

    const testes = [
      ['so idFilial',                 { idFilial: FILIAL, ...DATAS },                      FILIAL],
      ['so idFiliais',                { idFiliais: FILIAL, ...DATAS },                     FILIAL],
      ['idFilial + idFiliais',        { idFilial: FILIAL, idFiliais: FILIAL, ...DATAS },   FILIAL],
      ['+ todosRegistros',            { idFilial: FILIAL, idFiliais: FILIAL, todosRegistros:true, ...DATAS }, FILIAL],
      ['cabecalho na matriz',         { idFilial: FILIAL, idFiliais: FILIAL, ...DATAS },   MATRIZ],
      ['sem filial (referencia)',     { ...DATAS },                                        FILIAL],
    ];

    let melhor = null;
    for (const [nome, params, hdr] of testes) {
      try {
        const r = await buscar(params, hdr);
        const fs_ = porFilial(r);
        const soGarra = fs_.length === 1 && String(fs_[0][0]).startsWith(String(FILIAL));
        console.log(`\n${soGarra ? '>>>' : '   '} ${nome}  ->  ${r.length} titulo(s)`);
        fs_.slice(0,6).forEach(([k,v]) => console.log(`        filial ${k.padEnd(32)} ${String(v.n).padStart(5)} · saldo ${brl(v.saldo)}`));
        if (fs_.length > 6) console.log(`        ... e mais ${fs_.length-6} filial(is)`);
        if (soGarra && (!melhor || r.length > melhor.rows.length)) melhor = { nome, params, rows:r };
      } catch (e) {
        console.log(`\n    ${nome} -> ERRO: ${e.message.slice(0,300)}`);
      }
    }

    if (!melhor) {
      console.log('\n  Nenhuma combinacao trouxe SO o Garra. Me mande esta saida.\n');
      return;
    }

    console.log(`\n\n==================== RESULTADO ====================`);
    console.log(`  Filtro que funciona: ${melhor.nome}`);
    console.log(`  ${JSON.stringify(melhor.params)}`);

    // agora sem limite de data, so do Garra, para ver o total em aberto de verdade
    const p2 = { ...melhor.params, dtaInicial:'2000-01-01', dtaFinal:'2099-12-31' };
    const tudo = await buscar(p2, FILIAL);
    const abertos = tudo.filter(t => Number(t.pagar||0) > 0.009);
    const total = abertos.reduce((a,t)=>a+Number(t.pagar||0),0);

    console.log(`\n  TITULOS DO GARRA (todas as datas): ${tudo.length}`);
    console.log(`  EM ABERTO (saldo > 0):             ${abertos.length} · ${brl(total)}`);

    const cli = {};
    abertos.forEach(t => {
      const k = String(t.nomeEntidade || 'Sem cliente').slice(0,32);
      cli[k] = (cli[k]||0) + Number(t.pagar||0);
    });
    console.log('\n  MAIORES DEVEDORES:');
    Object.entries(cli).sort((a,b)=>b[1]-a[1]).slice(0,10)
      .forEach(([k,v]) => console.log(`    ${k.padEnd(34)} ${brl(v).padStart(16)}`));

    console.log('\n  AMOSTRA (3 titulos):');
    abertos.slice(0,3).forEach(t => console.log(
      `    conta ${t.dtaContaBr} · vcto ${t.dtaVctoBr} · ${String(t.nomeEntidade||'').slice(0,26).padEnd(27)} ` +
      `valor ${brl(t.valor).padStart(14)} · saldo ${brl(t.pagar).padStart(14)} · doc ${t.nroDoc ?? ''}`));

    console.log('\n  Copie esta saida e me mande.\n');

  } catch (e) {
    console.error('\nERRO:', e.message, '\n');
    process.exit(1);
  }
})();
