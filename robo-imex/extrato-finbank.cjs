#!/usr/bin/env node
/**
 * EXTRATO via FinBank (finbank.hubparente.com.br) → painel DRE
 *
 * Usa a API que a propria tela do FinBank usa (tRPC), com a sua sessao
 * logada. Nao precisa de credencial do banco aqui: o FinBank e quem fala
 * com o BB, com as chaves que ja estao cadastradas nele.
 *
 *   1. statement.fetchAll  -> FinBank busca no BB o extrato do periodo (todas as contas do Garra)
 *   2. statement.list      -> le do FinBank, pagina a pagina
 *   3. envia ao painel     -> tipo "extrato" (o painel ignora repetidos)
 *
 *   node extrato-finbank.cjs                -> ultimos 40 dias
 *   node extrato-finbank.cjs --teste        -> so mostra
 *   node extrato-finbank.cjs --dias 180     -> primeira carga
 *   node extrato-finbank.cjs --so-ler       -> pula o passo 1 (nao vai ao banco)
 *
 * No config.json:
 *   "finbank_url":        "https://finbank.hubparente.com.br",
 *   "finbank_cookie":     "<valor do cookie app_session_id do seu navegador logado no FinBank>",
 *   "finbank_company_id": 70001
 *
 * O cookie vale 1 ano. Quando expirar, o robo avisa "sessao do FinBank expirou":
 * e so entrar de novo no FinBank e copiar o cookie novo.
 */

const fs   = require('fs');
const path = require('path');

const CFG_PATH = path.join(__dirname, 'config.json');
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const log = (...a) => console.log(new Date().toLocaleString('pt-BR'), '·', ...a);

function carregar() {
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  if (!cfg.finbank_url || !cfg.finbank_cookie || /^COLE_|^SEU_/.test(cfg.finbank_cookie)) {
    throw new Error('config.json: preencha finbank_url e finbank_cookie');
  }
  return { cfg, base: String(cfg.finbank_url).replace(/\/+$/, ''), company: Number(cfg.finbank_company_id || 70001) };
}

// tRPC com superjson: datas vao como ISO + meta dizendo que sao Date
function superjson(obj) {
  const values = {};
  const json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) { json[k] = v.toISOString(); values[k] = ['Date']; }
    else json[k] = v;
  }
  return Object.keys(values).length ? { json, meta: { values } } : { json };
}

async function trpc(ctx, proc, input, { mutation = false } = {}) {
  const body = superjson(input);
  const headers = { 'Content-Type': 'application/json', Cookie: `app_session_id=${ctx.cfg.finbank_cookie}` };
  const r = mutation
    ? await fetch(`${ctx.base}/api/trpc/${proc}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) })
    : await fetch(`${ctx.base}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(body))}`, { headers, signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  if (j.error) {
    const msg = j.error?.json?.message || j.error?.message || JSON.stringify(j.error).slice(0, 200);
    if (/login|UNAUTHORIZED|10001|session/i.test(msg)) throw new Error('sessao do FinBank expirou — entre no FinBank e copie o cookie app_session_id de novo');
    throw new Error(`FinBank ${proc}: ${msg}`);
  }
  if (!r.ok) throw new Error(`FinBank ${proc}: HTTP ${r.status}`);
  return j.result?.data?.json;
}

/**
 * Pix recebidos por QR Code (cliente pagando na pista/loja) sao milhares por mes.
 * Viram UMA linha por dia: "Pix QR Code recebidos — N pagamentos". Tudo o mais
 * (Pix enviado, TED, Cielo, boletos, Pix recebido por chave) fica individual.
 * O dia usado e o da venda (vem no texto "26/09 10:35 ..."), nao o da
 * contabilizacao pelo banco (fim de semana cai na segunda).
 * Linhas agrupadas vao com agrupado:true para o painel ATUALIZAR o total
 * quando o dia ganhar mais lancamentos.
 */
function agruparPixQr(lista, ativo) {
  const individual = t => ({
    externalId: t.externalId, transactionDate: t.transactionDate, amount: t.amount, type: t.type,
    description: t.description, counterpartName: t.counterpartName, counterpartDocument: t.counterpartDocument,
  });
  if (!ativo) return lista.map(individual);
  const ehQr = t => t.type === 'credit' && /qr\s*code/i.test(String(t.description || ''));
  const grupos = new Map();
  const rows = [];
  for (const t of lista) {
    if (!ehQr(t)) { rows.push(individual(t)); continue; }
    const post = String(t.transactionDate).slice(0, 10);
    let dia = post;
    const m = String(t.counterpartName || '').match(/^(\d{2})\/(\d{2}) \d{2}:\d{2}/);
    if (m) {
      let ano = Number(post.slice(0, 4));
      if (Number(m[2]) > Number(post.slice(5, 7))) ano--;          // dezembro lancado em janeiro
      dia = `${ano}-${m[2]}-${m[1]}`;
    }
    const g = grupos.get(dia) || { n: 0, total: 0 };
    g.n++; g.total += Number(t.amount); grupos.set(dia, g);
  }
  for (const [dia, g] of grupos) {
    rows.push({ externalId: `pixqr-${dia}`, transactionDate: dia, amount: +g.total.toFixed(2), type: 'credit',
      description: `Pix QR Code recebidos — ${g.n} pagamento(s)`, counterpartName: 'Clientes (pista/loja)',
      counterpartDocument: null, agrupado: true });
  }
  return rows;
}

async function sincronizar({ dias = 40, teste = false, soLer = false } = {}) {
  const ctx = carregar();
  // meio-dia local: em UTC ainda e hoje (23:59 local virava amanha no servidor e o BB recusava com 400)
  const fim = new Date(); fim.setHours(12, 0, 0, 0);
  const ini = new Date(); ini.setDate(ini.getDate() - dias); ini.setHours(0, 0, 0, 0);

  const contas = await trpc(ctx, 'bankAccount.list', { companyId: ctx.company }) || [];
  if (!contas.length) throw new Error(`FinBank: empresa ${ctx.company} sem conta bancaria`);

  // 1. FinBank vai ao banco
  // (o BB so aceita ate ~30 dias por consulta; pedidos maiores voltam 400 — entao vai em janelas)
  let importados = null;
  if (!soLer && !teste) {
    importados = 0;
    const JANELA = 30;
    for (let a = new Date(ini); a <= fim; ) {
      const b = new Date(a); b.setDate(b.getDate() + JANELA - 1); b.setHours(12, 0, 0, 0);
      const fimJanela = b > fim ? fim : b;
      const r = await trpc(ctx, 'statement.fetchAll', { companyId: ctx.company, startDate: a, endDate: fimJanela }, { mutation: true });
      importados += Number(r?.imported ?? r?.totalImported ?? 0);
      if (r?.errors?.length) log(`FinBank avisou (${a.toISOString().slice(0,10)} a ${fimJanela.toISOString().slice(0,10)}):`, r.errors.join(' | ').slice(0, 200));
      a = new Date(fimJanela); a.setDate(a.getDate() + 1); a.setHours(0, 0, 0, 0);
    }
  }

  // 2. le tudo do periodo
  const todos = [];
  for (let offset = 0; ; offset += 100) {
    const r = await trpc(ctx, 'statement.list', { companyId: ctx.company, startDate: ini, endDate: fim, limit: 100, offset });
    const items = r?.items || [];
    todos.push(...items);
    if (!items.length || todos.length >= (r?.total || 0) || offset > 20000) break;
  }

  // 3. envia por conta
  let gravados = 0, ignorados = 0;
  const porConta = new Map();
  todos.forEach(t => { const l = porConta.get(t.bankAccountId) || []; l.push(t); porConta.set(t.bankAccountId, l); });
  if (!teste) {
    for (const [id, lista] of porConta) {
      const c = contas.find(x => x.id === id) || {};
      const agencia = c.agenciaDigito ? `${c.agencia}-${c.agenciaDigito}` : c.agencia;
      const conta   = c.contaDigito   ? `${c.conta}-${c.contaDigito}`     : c.conta;
      const rows = agruparPixQr(lista, ctx.cfg.finbank_agrupar_pix !== false);
      for (let i = 0; i < rows.length; i += 500) {
        const r = await fetch(ctx.cfg.painel_url, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ingest-token': ctx.cfg.painel_token },
          body: JSON.stringify({ tipo: 'extrato', agencia, conta, rows: rows.slice(i, i + 500) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(`painel respondeu ${r.status}: ${j.error || 'erro'}`);
        gravados += j.gravados || 0; ignorados += j.ignorados || 0;
      }
    }
  }

  const qr = todos.filter(t => t.type === 'credit' && /qr\s*code/i.test(String(t.description || ''))).length;
  const cred = todos.filter(t => t.type === 'credit').reduce((a, t) => a + Number(t.amount), 0);
  const deb  = todos.filter(t => t.type === 'debit').reduce((a, t) => a + Number(t.amount), 0);
  return { rows: todos, resumo:
    `${todos.length} lancamento(s) em ${porConta.size} conta(s) (${qr} Pix QR Code agrupados por dia) · entradas ${brl(cred)} · saidas ${brl(deb)}` +
    (importados != null ? ` · ${importados} novo(s) do banco` : '') +
    (teste ? ' · [teste] nada gravado' : ` · ${gravados} gravado(s) no painel`) };
}

module.exports = { sincronizar, existeConfig: () => {
  try { const c = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); return Boolean(c.finbank_url && c.finbank_cookie && !/^COLE_|^SEU_/.test(c.finbank_cookie)); } catch { return false; }
} };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--dias');
  sincronizar({ dias: i >= 0 ? Number(args[i + 1]) || 40 : 40, teste: args.includes('--teste'), soLer: args.includes('--so-ler') })
    .then(({ rows, resumo }) => {
      if (args.includes('--teste')) {
        rows.slice(0, 15).forEach(t => console.log(`  ${String(t.transactionDate).slice(0, 10)}  ${t.type === 'debit' ? '−' : '+'}${brl(t.amount).padStart(14)}  ${String(t.description || '').slice(0, 40).padEnd(41)} ${t.counterpartName || ''}`));
        if (rows.length > 15) console.log(`  ... e mais ${rows.length - 15}`);
      }
      log('extrato FinBank:', resumo);
    })
    .catch(e => { console.error(new Date().toLocaleString('pt-BR'), '· ERRO extrato FinBank:', e.message); process.exit(1); });
}
