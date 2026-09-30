#!/usr/bin/env node
/**
 * EXTRATO BB → painel DRE (chamada direta, sem depender do FinBank)
 *
 * Usa a mesma API do Banco do Brasil que o FinBank usa (Extratos v1, OAuth2 +
 * mTLS + gw-dev-app-key), com as credenciais do Posto Garra guardadas no
 * arquivo bb.json AO LADO deste script (nao vai para o GitHub).
 *
 *   node extrato-bb.cjs               -> ultimos 40 dias, grava no painel
 *   node extrato-bb.cjs --teste       -> so mostra, nao grava
 *   node extrato-bb.cjs --dias 120    -> primeira carga
 *
 * O sync.cjs chama este arquivo automaticamente quando o bb.json existe.
 *
 * bb.json (copie de bb.exemplo.json):
 *   clientId, clientSecret, gwDevAppKey  -> do portal developers.bb.com.br (app de Extratos)
 *   certificado                          -> caminho do .pfx / .p12 (mTLS), relativo a esta pasta
 *   certificadoSenha                     -> senha do .pfx
 *   agencia, conta                       -> como no FinBank (pode ter digito e hifen)
 *   ambiente                             -> "producao" ou "homologacao"
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BB_PATH  = path.join(__dirname, 'bb.json');
const CFG_PATH = path.join(__dirname, 'config.json');

const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const log = (...a) => console.log(new Date().toLocaleString('pt-BR'), '·', ...a);

function carregar() {
  if (!fs.existsSync(BB_PATH)) throw new Error('falta o bb.json nesta pasta (copie o bb.exemplo.json e preencha)');
  const bb = JSON.parse(fs.readFileSync(BB_PATH, 'utf8'));
  for (const k of ['clientId', 'clientSecret', 'gwDevAppKey', 'agencia', 'conta']) {
    if (!bb[k] || /^SEU_|^SUA_|^COLE_/.test(String(bb[k]))) throw new Error(`bb.json: falta preencher "${k}"`);
  }
  let pfx = null;
  if (bb.certificado) {
    const p = path.isAbsolute(bb.certificado) ? bb.certificado : path.join(__dirname, bb.certificado);
    if (!fs.existsSync(p)) throw new Error(`certificado nao encontrado: ${p}`);
    pfx = fs.readFileSync(p);
  }
  const prod = (bb.ambiente || 'producao') !== 'homologacao';
  return { bb, pfx, prod,
    oauth:   prod ? 'https://oauth.bb.com.br/oauth/token' : 'https://oauth.hm.bb.com.br/oauth/token',
    base:    prod ? 'https://api-extratos.bb.com.br/extratos/v1' : (pfx ? 'https://api-extratos.hm.bb.com.br/extratos/v1' : 'https://api.hm.bb.com.br/extratos/v1'),
  };
}

// http basico com https nativo (sem axios)
function pedir(url, { method = 'GET', headers = {}, body = null, pfx = null, passphrase = '' } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { method, hostname: u.hostname, port: 443, path: u.pathname + u.search, headers, timeout: 60000 };
    if (pfx) { opts.pfx = pfx; opts.passphrase = passphrase; opts.rejectUnauthorized = true; }
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let j = null; try { j = JSON.parse(data); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ status: res.statusCode, json: j, text: data });
        const msg = j?.error_description || j?.erroMensagem || j?.message || j?.erros?.[0]?.mensagem || data.slice(0, 200);
        const e = new Error(`HTTP ${res.statusCode}: ${msg}`); e.status = res.statusCode; reject(e);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const semDigito = s => String(s).split('-')[0].trim();
const semZeros  = s => String(s).replace(/^0+/, '') || '0';
const dataBB    = d => `${d.getDate()}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
const dataISO   = n => { const s = String(n).padStart(8, '0'); return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`; };

async function token(ctx) {
  const basic = Buffer.from(`${ctx.bb.clientId}:${ctx.bb.clientSecret}`).toString('base64');
  const r = await pedir(ctx.oauth, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials&scope=extrato-info' });
  if (!r.json?.access_token) throw new Error('BB nao devolveu access_token');
  return r.json.access_token;
}

/** Busca o extrato e devolve no formato que o painel aceita (tipo "extrato"). */
async function buscarExtrato(ctx, ini, fim) {
  const tk = await token(ctx);
  const ag = semZeros(semDigito(ctx.bb.agencia));
  const cc = semZeros(semDigito(ctx.bb.conta));
  const vistos = {};
  const rows = [];
  let pagina = 1;
  for (;;) {
    const q = new URLSearchParams({
      'gw-dev-app-key': ctx.bb.gwDevAppKey,
      numeroPaginaSolicitacao: String(pagina),
      quantidadeRegistroPaginaSolicitacao: '200',
      dataInicioSolicitacao: dataBB(ini),
      dataFimSolicitacao: dataBB(fim),
    });
    let r;
    try {
      r = await pedir(`${ctx.base}/conta-corrente/agencia/${ag}/conta/${cc}?${q}`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        pfx: ctx.pfx, passphrase: ctx.bb.certificadoSenha || '' });
    } catch (e) {
      if (e.status === 404) break;          // sem lancamentos no periodo
      throw e;
    }
    const d = r.json || {};
    for (const tx of d.listaLancamento || []) {
      const tipoLanc = String(tx.indicadorTipoLancamento);
      if (!'123'.includes(tipoLanc)) continue;                 // S, D, R... sao linhas de saldo
      const cod = tx.codigoHistorico ? String(tx.codigoHistorico) : '';
      const desc = String(tx.textoDescricaoHistorico || '');
      const dl = desc.toLowerCase();
      if (cod === '999' || dl.includes('saldo anterior') || dl.includes('saldo do dia')) continue;
      const valor = Math.abs(parseFloat(tx.valorLancamento || 0));
      if (!valor) continue;
      const sinal = tx.indicadorSinalLancamento;
      // mesma chave estavel do FinBank, para nao duplicar se os dois rodarem
      const chave = `bb-${tx.dataLancamento}-${cod || '0'}-${sinal}-${tx.valorLancamento}`;
      if (!vistos[chave]) vistos[chave] = { n: 1, tipos: new Set([tipoLanc]) };
      else if (vistos[chave].tipos.has(tipoLanc)) vistos[chave].n++;
      else continue;                                            // mesmo lancamento, indicador diferente
      const n = vistos[chave].n;
      rows.push({
        externalId: n > 1 ? `${chave}-${n}` : chave,
        transactionDate: dataISO(tx.dataLancamento),
        amount: valor,
        type: sinal === 'D' ? 'debit' : 'credit',
        description: desc,
        counterpartName: tx.textoInformacaoComplementar || null,
        counterpartDocument: tx.numeroCpfCnpjContrapartida ? String(tx.numeroCpfCnpjContrapartida) : null,
      });
    }
    const prox = Number(d.numeroPaginaProximo || 0);
    if (prox > pagina) pagina = prox; else break;
  }
  return rows;
}

async function enviar(cfg, ctx, rows, teste) {
  if (!rows.length) return { gravados: 0 };
  if (teste) return { gravados: 0, teste: true };
  let gravados = 0, ignorados = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(cfg.painel_url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-token': cfg.painel_token },
      body: JSON.stringify({ tipo: 'extrato', agencia: ctx.bb.agencia, conta: ctx.bb.conta, rows: rows.slice(i, i + 500) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`painel respondeu ${r.status}: ${j.error || 'erro'}`);
    gravados += j.gravados || 0; ignorados += j.ignorados || 0;
  }
  return { gravados, ignorados };
}

/** Usado pelo sync.cjs. Devolve resumo em texto; lanca erro se falhar. */
async function sincronizar({ dias = 40, teste = false } = {}) {
  const ctx = carregar();
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  const fim = new Date();
  const ini = new Date(); ini.setDate(ini.getDate() - dias);
  const rows = await buscarExtrato(ctx, ini, fim);
  const cred = rows.filter(r => r.type === 'credit').reduce((a, r) => a + r.amount, 0);
  const deb  = rows.filter(r => r.type === 'debit').reduce((a, r) => a + r.amount, 0);
  const r = await enviar(cfg, ctx, rows, teste);
  return { rows, resumo: `${rows.length} lancamento(s) · entradas ${brl(cred)} · saidas ${brl(deb)}` +
    (teste ? ' · [teste] nada gravado' : ` · ${r.gravados} gravado(s) no painel`) };
}

module.exports = { sincronizar, existeConfig: () => fs.existsSync(BB_PATH) };

if (require.main === module) {
  const args = process.argv.slice(2);
  const teste = args.includes('--teste');
  const i = args.indexOf('--dias');
  const dias = i >= 0 ? Number(args[i + 1]) || 40 : 40;
  sincronizar({ dias, teste }).then(({ rows, resumo }) => {
    if (teste) rows.slice(0, 15).forEach(r => console.log(`  ${r.transactionDate}  ${r.type === 'debit' ? '−' : '+'}${brl(r.amount).padStart(14)}  ${r.description.slice(0, 40).padEnd(41)} ${r.counterpartName || ''}`));
    if (teste && rows.length > 15) console.log(`  ... e mais ${rows.length - 15}`);
    log('extrato BB:', resumo);
  }).catch(e => { console.error(new Date().toLocaleString('pt-BR'), '· ERRO extrato BB:', e.message); process.exit(1); });
}
