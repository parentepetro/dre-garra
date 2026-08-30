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

const FILIAL  = Number(CFG.filial);
const MATRIZ  = Number(CFG.matriz);

// Endereco do Imex. Dentro do posto vale o IP interno; de fora, o DDNS.
// O robo testa os dois e usa o primeiro que responder — assim funciona
// no Mac Mini do escritorio e no notebook em qualquer lugar.
const limpar = u => String(u || '').replace(/\/+$/, '');
const CANDIDATOS = [
  process.env.ERP_URL,
  CFG.erp_url,
  CFG.erp_url_externo || 'http://redeparente.ddns.com.br:4000',
].map(limpar).filter((u, i, a) => u && a.indexOf(u) === i);

let ERP = CANDIDATOS[0];

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
async function escolherServidor() {
  const erros = [];
  for (const url of CANDIDATOS) {
    try {
      const r = await fetch(`${url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{__typename}' }),
        signal: AbortSignal.timeout(8000),
      });
      await r.text();
      ERP = url;
      log(`servidor do Imex: ${url}`);
      return;
    } catch (e) {
      erros.push(`${url} (${e.message})`);
    }
  }
  throw new Error('nenhum endereco do Imex respondeu: ' + erros.join(' | '));
}

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

// Contas a receber. Descoberto no Imex:
//   - quem filtra a filial e "idFiliais" (o "idFilial" sozinho NAO filtra: traz a rede toda)
//   - tipoData 0 = DATA DA CONTA (1 e 2 filtram por vencimento)
//   - a situacao vem vazia nesta consulta; "em aberto" sai do saldo (campo "pagar")
const Q_RECEBER = `query cr($p: ParamsGerenciarContasReceber!){
  getGerenciamentoContasReceber(paramsContaReceber: $p){
    idContasReceber idFilial nomeFilial idEntidade nomeEntidade cnpjCpf
    dtaContaBr dtaVctoBr valor vlrPago pagar nroDoc historico nroPlaca } }`;

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
    await escolherServidor();
    await entrar();
    const mapa   = await planoDeContas();
    const lista  = meses(N_MESES);
    log(`sincronizando ${lista.length} mês(es): ${lista.map(m => m.competencia.slice(0,7)).join(', ')}`);

    // ---- vendas
    const num = v => (v === null || v === undefined || isNaN(v)) ? 0 : +Number(v).toFixed(2);
    const vendas = [];
    for (const m of lista) {
      const d = await gql(Q_VENDAS, { a: m.ini, b: m.fim, f: [FILIAL] });
      const obs = `Imex/XPert · filial ${FILIAL} · ${m.competencia.slice(0,7)}${m.parcial ? ` (parcial ate ${m.fim})` : ''}`;

      const c = { fat:num(d.c?.faturamento), cus:num(d.c?.custo), qtd:num(d.c?.qtde) };
      const p = { fat:num(d.p?.faturamento), cus:num(d.p?.custo), qtd:num(d.p?.qtde) };

      // mes sem movimento (posto ainda nao operava, por exemplo) — pula
      if (!c.fat && !c.cus && !p.fat && !p.cus) {
        log(`  ${m.competencia.slice(0,7)}  sem movimento no Imex — ignorado`);
        continue;
      }
      if (c.fat || c.cus) vendas.push({ competencia:m.competencia, segmento:'combustiveis',
        faturamento_bruto:c.fat, custo_mercadoria:c.cus, volume_litros:c.qtd, observacoes:obs });
      if (p.fat || p.cus) vendas.push({ competencia:m.competencia, segmento:'conveniencia',
        faturamento_bruto:p.fat, custo_mercadoria:p.cus, volume_litros:p.qtd, observacoes:obs + ' (pista/loja)' });

      const lb = (c.fat + p.fat) - (c.cus + p.cus);
      log(`  ${m.competencia.slice(0,7)}  faturamento ${brl(c.fat + p.fat)}  ·  lucro bruto ${brl(lb)}`);
    }
    const rv = await enviar('vendas', vendas);
    log(`vendas: ${vendas.length} linha(s) enviada(s)${rv.gravados ? ` · ${rv.gravados} gravada(s)` : ''}`);

    // ---- despesas
    let despesas = [];
    for (const m of lista) {
      const d = await gql(Q_CONTAS_PAGAR, { filial:[FILIAL], tipoConta:0, vinculado:0,
        dataInicial:m.ini, dataFinal:m.fim, usarPeriodo:true, tipoData:0, page:1, offset:20000 });
      const rows = (d.getContasPagar || [])
        .filter(x => x && x.dtaContaBr && x.valor != null)
        .map(x => {
          const [cod, nome] = mapa[x.idPlanoDeContas] || ['?', '?'];
          return { erp_id:x.idContasPagar, filial:FILIAL, data:x.dtaContaBr, conta_codigo:cod,
                   conta_nome:nome, fornecedor:x.nomeEntidade || '', historico:x.historico || '',
                   valor:Number(x.valor) };
        });
      log(`  ${m.competencia.slice(0,7)}  ${rows.length} lançamento(s) no contas a pagar`);
      despesas = despesas.concat(rows);
    }
    const rd = await enviar('despesas', despesas);
    log(`despesas: ${despesas.length} enviada(s)` +
        (rd.gravados !== undefined ? ` · ${rd.gravados} gravada(s) no DRE · ${rd.ignorados||0} fora do DRE (compra de combustível, conta patrimonial)` : ''));

    // ---- contas a receber (todos os titulos, nao so os do periodo:
    //      titulo antigo que continua em aberto precisa aparecer na cobranca)
    const hj = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const crIni = iso(new Date(hj.getFullYear() - 2, 0, 1));
    const crFim = iso(new Date(hj.getFullYear() + 2, 11, 31));

    const cr = await gql(Q_RECEBER, { p: {
      idFiliais: FILIAL,          // este e o que restringe a filial
      dtaInicial: crIni, dtaFinal: crFim,
      tipoData: 0                 // 0 = data da conta
    }});
    const titulos = (cr.getGerenciamentoContasReceber || [])
      .filter(x => x && x.dtaContaBr && Number(x.idFilial) === FILIAL)
      .map(x => ({
        erp_id: x.idContasReceber, filial: FILIAL,
        data: x.dtaContaBr, vencimento: x.dtaVctoBr,
        cliente: x.nomeEntidade, cliente_doc: x.cnpjCpf,
        documento: x.nroDoc != null ? String(x.nroDoc) : null,
        placa: x.nroPlaca, historico: x.historico,
        valor: Number(x.valor || 0), valor_pago: Number(x.vlrPago || 0),
        valor_aberto: Number(x.pagar || 0)
      }));
    const emAberto = titulos.filter(t => t.valor_aberto > 0.009);
    log(`  contas a receber: ${titulos.length} titulo(s) · ${emAberto.length} em aberto ` +
        `· ${brl(emAberto.reduce((a,t)=>a+t.valor_aberto,0))}`);

    let gravRec = 0;
    for (let i = 0; i < titulos.length; i += 300) {
      const r = await enviar('receber', titulos.slice(i, i + 300));
      gravRec += r.gravados || 0;
    }
    log(`a receber: ${titulos.length} enviado(s)${gravRec ? ` · ${gravRec} gravado(s)` : ''}`);

    log(TESTE ? 'MODO TESTE — nada foi gravado.' : 'sincronização concluída.');
  } catch (e) {
    console.error(new Date().toLocaleString('pt-BR'), '· ERRO:', e.message);
    process.exit(1);
  }
})();
