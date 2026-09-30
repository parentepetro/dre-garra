#!/usr/bin/env node
/**
 * DESCOBERTA — estoque atual no Imex (tanques, medicao, LMC, produtos).
 *
 * 1. pergunta ao servidor quais consultas existem com cara de estoque
 * 2. tenta rodar as que aceitam so filial/data, montando a lista de campos
 *    sozinho a partir do tipo de retorno
 * 3. mostra as primeiras linhas de cada uma
 *
 * NAO grava nada. So le e mostra.
 *
 *   node descobrir-estoque.cjs
 *   node descobrir-estoque.cjs > estoque.txt
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

const log = (...a) => console.log(...a);
const andamento = (...a) => console.error(...a);
let TOKEN = null, X_USER = null;

const hoje = new Date();
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const HOJE = iso(hoje);
const MES_INI = HOJE.slice(0, 8) + '01';

async function gql(query, variables = {}, comAuth = true) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) Object.assign(headers, {
    authorization: `Bearer ${TOKEN}`, 'x-filial': String(FILIAL),
    'x-matriz': String(MATRIZ), 'x-user': String(X_USER ?? ''),
    'x-serial-terminal': 'RETAGUARDA',
  });
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60000) });
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

// desembrulha NON_NULL / LIST ate chegar no tipo de verdade
const base = t => { while (t && (t.kind === 'NON_NULL' || t.kind === 'LIST')) t = t.ofType; return t; };
const nomeTipo = t => { const b = base(t); return b ? b.name || b.kind : '?'; };
const ehLista = t => { while (t) { if (t.kind === 'LIST') return true; t = t.ofType; } return false; };
const obrigatorio = t => t && t.kind === 'NON_NULL';

// valores que a gente sabe preencher, pelo nome do argumento
function valorPara(arg) {
  const n = arg.name.toLowerCase();
  const t = nomeTipo(arg.type);
  const lista = ehLista(arg.type);
  const filial = lista ? [FILIAL] : FILIAL;
  if (/^(id)?filia(l|is)$|^arrfilial$|^filiais$|^idfiliais$/.test(n)) return filial;
  if (/^(id)?matriz$/.test(n)) return MATRIZ;
  if (/(datain|dtaini|dataini|inicio|inicial|datade|dtade)/.test(n)) return MES_INI;
  if (/(datafi|dtafim|datafim|final|dataate|dtaate|^data$|^dta$|^dia$)/.test(n)) return HOJE;
  if (/^(_limit|limit|offset|_offset|page|pagina|qtd|quantidade)$/.test(n)) return /limit|qtd|quantidade/.test(n) ? 50 : 0;
  if (t === 'Boolean') return false;
  return undefined;
}

const RE = /(estoq|tanque|medic|lmc|bico|invent|saldoprod|produto.*saldo|saldo.*produto|fisico|combustivel.*(atual|saldo|estoq))/i;

(async () => {
  try {
    await escolherServidor();
    const d = await gql(`mutation login($usuario:String!,$senha:String!){
      login(usuario:$usuario,senha:$senha){ token payload{id} usuario{idUsuarios nomeUsuarios} } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false);
    TOKEN = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    log(`conectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario} · filial ${FILIAL} · ${HOJE}\n`);

    andamento('  lendo o esquema do servidor ...');
    const intro = await gql(`{ __schema { queryType { fields { name
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }`);
    const campos = intro.__schema.queryType.fields || [];
    const bons = campos.filter(f => RE.test(f.name));

    log('='.repeat(90));
    log(`  1. CONSULTAS COM CARA DE ESTOQUE (${bons.length} de ${campos.length})`);
    log('='.repeat(90));
    bons.forEach(f => {
      const args = (f.args || []).map(a => `${a.name}${obrigatorio(a.type) ? '!' : ''}: ${nomeTipo(a.type)}${ehLista(a.type) ? '[]' : ''}`).join(', ');
      log(`    ${f.name}(${args}) -> ${nomeTipo(f.type)}${ehLista(f.type) ? '[]' : ''}`);
    });

    // campos escalares de um tipo (com um nivel de objeto aninhado)
    const cacheTipo = {};
    async function camposDe(nome, prof = 0) {
      if (!nome) return '';
      if (!cacheTipo[nome]) {
        const t = await gql(`{ __type(name:"${nome}") { kind fields { name type { kind name ofType { kind name ofType { kind name } } } } } }`);
        cacheTipo[nome] = t.__type;
      }
      const tipo = cacheTipo[nome];
      if (!tipo || !tipo.fields) return '';
      const partes = [];
      for (const f of tipo.fields) {
        const b = base(f.type);
        if (!b) continue;
        if (b.kind === 'SCALAR' || b.kind === 'ENUM') partes.push(f.name);
        else if (b.kind === 'OBJECT' && prof < 1) {
          const sub = await camposDe(b.name, prof + 1);
          if (sub) partes.push(`${f.name} { ${sub} }`);
        }
      }
      return partes.join(' ');
    }

    log('\n' + '='.repeat(90));
    log('  2. TENTANDO RODAR CADA UMA (so as que aceitam filial/data)');
    log('='.repeat(90));

    for (const f of bons) {
      const args = f.args || [];
      const vars = {}, defs = [], pass = [];
      let ok = true;
      for (const a of args) {
        const v = valorPara(a);
        if (v === undefined) { if (obrigatorio(a.type)) { ok = false; break; } else continue; }
        const tipoGql = (() => {
          // reconstroi o tipo como o servidor declarou (NON_NULL / LIST)
          const monta = t => !t ? '' : t.kind === 'NON_NULL' ? monta(t.ofType) + '!' : t.kind === 'LIST' ? `[${monta(t.ofType)}]` : t.name;
          return monta(a.type);
        })();
        vars[a.name] = v; defs.push(`$${a.name}: ${tipoGql}`); pass.push(`${a.name}: $${a.name}`);
      }
      if (!ok) { log(`\n  ${f.name}: pulei (pede argumento que nao sei preencher: ${args.filter(a => obrigatorio(a.type) && valorPara(a) === undefined).map(a => a.name).join(', ')})`); continue; }

      const tipoRet = base(f.type);
      let selecao = '';
      if (tipoRet && tipoRet.kind === 'OBJECT') selecao = await camposDe(tipoRet.name);
      const q = `query q${defs.length ? '(' + defs.join(', ') + ')' : ''} { r: ${f.name}${pass.length ? '(' + pass.join(', ') + ')' : ''}${selecao ? ` { ${selecao} }` : ''} }`;

      andamento(`  ${f.name} ...`);
      try {
        const r = await gql(q, vars);
        const dados = r.r;
        const lista = Array.isArray(dados) ? dados : dados == null ? [] : [dados];
        log(`\n  ${f.name}  ->  ${lista.length} linha(s)   [args: ${JSON.stringify(vars)}]`);
        lista.slice(0, 15).forEach(x => log('    ' + JSON.stringify(x).slice(0, 400)));
        if (lista.length > 15) log(`    ... e mais ${lista.length - 15}`);
      } catch (e) {
        log(`\n  ${f.name}  ->  ERRO: ${e.message.slice(0, 160)}`);
      }
    }

    log('\n  Copie tudo isso e me mande (ou rode com "> estoque.txt" e me avise).\n');
  } catch (e) {
    console.error('\nERRO:', e.message, '\n');
    process.exit(1);
  }
})();
