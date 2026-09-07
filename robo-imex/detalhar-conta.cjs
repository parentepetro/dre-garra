#!/usr/bin/env node
/**
 * DETALHAR CONTA — mostra lancamento por lancamento o que o Imex tem em uma
 * ou mais contas do plano de contas (contas a pagar), para achar o que foi
 * lancado no lugar errado.
 *
 * NAO grava nada. So le e mostra.
 *
 *   node detalhar-conta.cjs                          -> 3.2.03.18, 3.2.04.09 e 3.2.04.10, abril a hoje
 *   node detalhar-conta.cjs 3.2.03.18                -> so essa conta
 *   node detalhar-conta.cjs 3.2.03.18 2026-07-01 2026-07-31
 *   node detalhar-conta.cjs 3.2.03                   -> o grupo inteiro (prefixo)
 *   node detalhar-conta.cjs --tudo                   -> varre tambem as outras combinacoes do contas a pagar (lento)
 *
 * No fim, procura em TODAS as contas lancamentos com cara de adquirente
 * (Rede, Cielo, maquineta, POS, terminal, antecipacao), para ver se a Rede
 * continuou cobrando depois da troca.
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

const args = process.argv.slice(2);
const CONTAS = args.filter(a => /^\d/.test(a) && !/^\d{4}-/.test(a));   // --tudo e tratado adiante
const DATAS  = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const ALVOS  = CONTAS.length ? CONTAS : ['3.2.03.18', '3.2.04.09', '3.2.04.10'];
const hoje = new Date();
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const INI = DATAS[0] || '2026-04-01';
const FIM = DATAS[1] || iso(hoje);

const brl = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const log = (...a) => console.log(...a);
const andamento = (...a) => console.error(...a);   // vai para a tela mesmo com '> arquivo.txt'
let TOKEN = null, X_USER = null;

async function gql(query, variables = {}, comAuth = true) {
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (comAuth) Object.assign(headers, {
    authorization: `Bearer ${TOKEN}`, 'x-filial': String(FILIAL),
    'x-matriz': String(MATRIZ), 'x-user': String(X_USER ?? ''),
    'x-serial-terminal': 'RETAGUARDA',
  });
  const r = await fetch(`${ERP}/graphql`, { method:'POST', headers, body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(180000) });
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join(' | '));
  return j.data;
}

async function escolherServidor() {
  for (const url of CANDIDATOS) {
    try {
      await fetch(`${url}/graphql`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query:'{__typename}' }), signal: AbortSignal.timeout(8000) });
      ERP = url; log(`servidor do Imex: ${url}\n`); andamento(`servidor: ${url}`); return;
    } catch {}
  }
  throw new Error('nenhum endereco do Imex respondeu');
}

const Q_CP = `query cp($filial:[Float!]!,$tipoConta:Float!,$vinculado:Float!,$dataInicial:String!,
  $dataFinal:String!,$usarPeriodo:Boolean!,$tipoData:Float!,$page:Float,$offset:Float){
  getContasPagar(filial:$filial,tipoConta:$tipoConta,vinculado:$vinculado,dataInicial:$dataInicial,
    dataFinal:$dataFinal,usarPeriodo:$usarPeriodo,tipoData:$tipoData,page:$page,offset:$offset){
    idContasPagar idPlanoDeContas nomeEntidade historico dtaContaBr dtaVctoBr dtaPagtoBr valor vlrPago documento } }`;
// se o servidor reclamar de campo inexistente, cai para a versao enxuta
const Q_CP_MIN = Q_CP.replace(' dtaVctoBr dtaPagtoBr', '').replace(' vlrPago', '');

const Q_PLANO = `query pc($idFilial:Float!,$_limit:Int!,$_offset:Int!){
  planosDeContas(idFilial:$idFilial,_limit:$_limit,_offset:$_offset){
    idPlanoDeContas codigoPlanoDeContas nomePlanoDeContas } }`;

const ADQ = /(\brede\b|redecard|cielo|getnet|stone|sipag|maquin|\bpos\b|terminal|antecipa|adquir|credishop)/i;

(async () => {
  try {
    await escolherServidor();
    const d = await gql(`mutation login($usuario:String!,$senha:String!){
      login(usuario:$usuario,senha:$senha){ token payload{id} usuario{idUsuarios nomeUsuarios} } }`,
      { usuario: CFG.imex_usuario, senha: CFG.imex_senha }, false);
    TOKEN = d.login.token;
    X_USER = d.login.payload?.id ?? d.login.usuario?.idUsuarios ?? '';
    log(`conectado como ${d.login.usuario?.nomeUsuarios || CFG.imex_usuario}`);
    log(`periodo: ${INI} a ${FIM} · contas: ${ALVOS.join(', ')}\n`);

    andamento('  lendo plano de contas ...');
    const mapa = {};
    for (let off = 0; off < 4000; off += 500) {
      const p = await gql(Q_PLANO, { idFilial: FILIAL, _limit: 500, _offset: off });
      const l = p.planosDeContas || [];
      l.forEach(c => mapa[c.idPlanoDeContas] = { cod: String(c.codigoPlanoDeContas || ''), nome: c.nomePlanoDeContas || '' });
      if (l.length < 500) break;
    }

    // mes a mes, como o robo faz (uma consulta grande demais trava o servidor do Imex).
    // Por padrao usa tipoConta 0 / vinculado 0 (a combinacao do robo, onde estao os lancamentos);
    // com --tudo varre tambem as outras combinacoes.
    const meses = [];
    for (let d = new Date(INI + 'T00:00:00'); iso(d) <= FIM; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const ini = iso(d) < INI ? INI : iso(d);
      const ultimo = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      meses.push([ini, ultimo > FIM ? FIM : ultimo]);
    }
    const combos = args.includes('--tudo')
      ? [0,1,2,3].flatMap(tc => [0,1,2].map(v => [tc, v]))
      : [[0, 0]];
    const todos = new Map();
    let query = Q_CP;
    for (const [tipoConta, vinculado] of combos) {
      for (const [mi, mf] of meses) {
        andamento(`  contas a pagar ${mi} a ${mf}` + (combos.length > 1 ? ` (tipoConta ${tipoConta} / vinculado ${vinculado})` : '') + ' ...');
        const vars = { filial:[FILIAL], tipoConta, vinculado, dataInicial: mi, dataFinal: mf,
          usarPeriodo: true, tipoData: 0, page: 1, offset: 20000 };
        let r;
        try {
          r = await gql(query, vars);
        } catch (e) {
          if (query === Q_CP && /dtaVctoBr|dtaPagtoBr|vlrPago/.test(e.message)) {
            query = Q_CP_MIN;
            r = await gql(query, vars);
          } else { andamento(`    (falhou: ${e.message.slice(0, 80)})`); continue; }
        }
        let novos = 0;
        (r.getContasPagar || []).forEach(x => {
          if (!todos.has(x.idContasPagar)) { todos.set(x.idContasPagar, { ...x, origem: `tc${tipoConta}/v${vinculado}` }); novos++; }
        });
        andamento(`    ${novos} lancamento(s)`);
      }
    }
    log(`${todos.size} lancamento(s) no contas a pagar do periodo\n`);
    andamento(`  ${todos.size} lancamento(s) lidos. Gravando o resultado...`);

    const linha = x => {
      const c = mapa[x.idPlanoDeContas] || {};
      const pg = x.dtaPagtoBr ? ` pago ${x.dtaPagtoBr}` : '';
      return `  ${String(x.dtaContaBr||'').padEnd(10)}${pg.padEnd(17)} ${brl(x.valor).padStart(14)}  ` +
        `${String(x.nomeEntidade||'').slice(0,28).padEnd(29)} ${String(x.historico||'').slice(0,40).padEnd(41)} ` +
        `doc ${x.documento ?? '-'}  [${x.origem}]`;
    };

    for (const alvo of ALVOS) {
      const itens = [...todos.values()].filter(x => (mapa[x.idPlanoDeContas]?.cod || '').startsWith(alvo));
      const nome = Object.values(mapa).find(c => c.cod === alvo)?.nome || '';
      log('='.repeat(110));
      log(`  ${alvo} ${nome}  ·  ${itens.length} lancamento(s)  ·  ${brl(itens.reduce((a,x)=>a+Number(x.valor||0),0))}`);
      log('='.repeat(110));
      if (!itens.length) {
        log('  (nada no contas a pagar — entao o valor da DRE vem de outro modulo: conciliacao de cartoes,');
        log('   caixa ou lancamento direto no financeiro. Nesse caso quem detalha e o Imex, no relatorio 40 - Despesas.)\n');
        continue;
      }
      itens.sort((a,b) => String(a.dtaContaBr).split('/').reverse().join('').localeCompare(String(b.dtaContaBr).split('/').reverse().join('')));
      itens.forEach(x => log(linha(x)));
      // por mes e por fornecedor
      const porMes = {}, porForn = {};
      itens.forEach(x => {
        const m = String(x.dtaPagtoBr || x.dtaContaBr || '').slice(3);
        porMes[m] = (porMes[m]||0) + Number(x.valor||0);
        const f = x.nomeEntidade || '(sem fornecedor)';
        porForn[f] = (porForn[f]||0) + Number(x.valor||0);
      });
      log('\n  por mes:        ' + Object.entries(porMes).map(([m,v]) => `${m} ${brl(v)}`).join('  ·  '));
      log('  por fornecedor: ' + Object.entries(porForn).sort((a,b)=>b[1]-a[1]).map(([f,v]) => `${f} ${brl(v)}`).join('  ·  ') + '\n');
    }

    log('='.repeat(110));
    log('  LANCAMENTOS COM CARA DE ADQUIRENTE / MAQUINETA EM QUALQUER CONTA (Rede, Cielo, POS, antecipacao...)');
    log('='.repeat(110));
    const adq = [...todos.values()].filter(x => ADQ.test(x.nomeEntidade||'') || ADQ.test(x.historico||''));
    if (!adq.length) log('  nenhum');
    adq.sort((a,b) => String(a.dtaContaBr).split('/').reverse().join('').localeCompare(String(b.dtaContaBr).split('/').reverse().join('')));
    adq.forEach(x => {
      const c = mapa[x.idPlanoDeContas] || {};
      log(linha(x) + `  -> ${c.cod} ${c.nome}`);
    });
    log('');
    andamento('  pronto. Resultado no arquivo.');
  } catch (e) {
    console.error('\nERRO:', e.message);
    process.exit(1);
  }
})();
