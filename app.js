/* ============================================================
   DRE · POSTO PARENTE GARRA
   ============================================================ */
const SUPABASE_URL = 'https://xqranvotievwkoohsznq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxcmFudm90aWV2d2tvb2hzem5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTU2NTcsImV4cCI6MjEwMDQ5MTY1N30.6wgaTa_wF1As_MIya7PnILBvrK_KC3UyhqJcyYHTZCY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ---------- paleta validada (dataviz) ---------- */
const PAL = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const INK = { primary:'#0f1b24', secondary:'#4d5c68', muted:'#83919c', grid:'#e6eaef', base:'#cdd5dd', surface:'#ffffff' };

/* ---------- estado ---------- */
const S = {
  user:null, perfil:null, admin:false,
  from:null, to:null, preset:'ano',
  page:'dashboard',
  socios:[], empresas:[], categorias:[], contas:[], regras:[], acertoPostos:[],
  charts:{}, sub:{}
};

/* ============================================================
   HELPERS
   ============================================================ */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const NUM = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const money = v => BRL.format(Number(v)||0);
const moneyShort = v => {
  const n = Number(v)||0, a = Math.abs(n);
  if (a >= 1e6) return (n/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';
  if (a >= 1e3) return (n/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';
  return NUM.format(n);
};
const pct = (a,b) => {
  if (!b) return '—';
  const v = a/b*100;
  // mostra mais casas quando arredondar esconderia que existe algo ali
  const casas = (v > 0 && v < 0.1) || (v < 100 && v >= 99.9) ? 2 : 1;
  return v.toLocaleString('pt-BR',{maximumFractionDigits:casas})+'%';
};

const today = () => new Date();
const iso = d => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0,10);
  const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
};
const brDate = s => { if(!s) return '—'; const [y,m,d]=String(s).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
const monthKey = s => String(s||'').slice(0,7);
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const monthLabel = k => { if(!k) return '—'; const [y,m]=k.split('-'); return `${MES[+m-1]}/${String(y).slice(2)}`; };
const monthLabelLong = k => { if(!k) return '—'; const [y,m]=k.split('-'); return `${MESL[+m-1]} de ${y}`; };

function toast(msg, err=false){
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast on' + (err?' err':'');
  clearTimeout(t._t); t._t = setTimeout(()=>t.className='toast', 3200);
}

function parseMoney(str){
  if (str == null) return 0;
  if (typeof str === 'number') return str;
  let s = String(str).replace(/[R$\s ]/gi,'').trim();
  let neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s);
  s = s.replace(/[()\-]/g,'');
  if (s.includes(',') && s.includes('.')) {
    // tem os dois: o ultimo que aparecer e o separador decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if (s.includes(',')) {
    s = s.replace(/\./g,'').replace(',','.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // so pontos, em grupos de 3: e separador de milhar (70.000 = setenta mil)
    s = s.replace(/\./g,'');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
}

/* ---------- ícones ---------- */
const I = {
  dash:'<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  in:'<path d="M12 19V5M5 12l7-7 7 7"/>',
  out:'<path d="M12 5v14M19 12l-7 7-7-7"/>',
  exp:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  bank:'<path d="M3 21h18M4 10v8M9 10v8M15 10v8M20 10v8M2 10l10-6 10 6"/>',
  chart:'<path d="M3 3v18h18M7 15l4-5 3 3 5-7"/>',
  doc:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.63.68 1.09 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  up:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  dl:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  link:'<path d="M20 6L9 17l-5-5"/>',
  recv:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  hand:'<path d="M12 2v10M9 5l3-3 3 3"/><path d="M4 12v5a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5v-5"/>',
  swap:'<path d="M7 16H3m0 0l3-3m-3 3l3 3M17 8h4m0 0l-3-3m3 3l-3 3"/><path d="M3 8h10M11 16h10"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
};
const svg = (p,sz=18)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${sz}" height="${sz}">${p}</svg>`;

const PAGES = [
  {sec:'Visão geral'},
  {id:'dashboard', nome:'Dashboard', icon:I.dash, sub:'Resultado consolidado do período'},
  {id:'vendas', nome:'Vendas', icon:I.chart, sub:'Faturamento, CMV, lucro bruto e margem'},
  {sec:'Movimentação'},
  {id:'aportes', nome:'Aportes', icon:I.in, sub:'Capital investido por cada sócio'},
  {id:'retiradas', nome:'Retiradas', icon:I.out, sub:'Pró-labore, lucros e adiantamentos'},
  {id:'despesas', nome:'Despesas', icon:I.exp, sub:'Custos e despesas por centro de custo'},
  {id:'receber', nome:'A receber', icon:I.recv, sub:'Títulos em aberto por cliente'},
  {sec:'Controle'},
  {id:'acerto', nome:'Acerto de contas', icon:I.swap, sub:'Dinheiro e combustível com os postos do grupo'},
  {id:'creditos', nome:'Créditos', icon:I.hand, sub:'O que terceiros devem ao posto'},
  {id:'conciliacao', nome:'Conciliação', icon:I.bank, sub:'Extratos bancários e vínculos'},
  {id:'documentos', nome:'Documentos', icon:I.doc, sub:'Arquivos mensais e obrigatórios'},
  {id:'cadastros', nome:'Cadastros', icon:I.cog, sub:'Sócios, empresas, categorias e contas'}
];

/* ============================================================
   AUTH
   ============================================================ */
const EMAIL_OF = u => `${String(u).trim().toLowerCase()}@postogarra.app`;

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), msg = $('#loginMsg');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  msg.className = 'msg';
  const { error } = await sb.auth.signInWithPassword({
    email: EMAIL_OF($('#u').value), password: $('#p').value
  });
  if (error) {
    const m = String(error.message||'');
    msg.className = 'msg err';
    msg.textContent = /invalid login|credentials/i.test(m)
      ? 'Usuário ou senha inválidos.'
      : /fetch|network|failed/i.test(m)
        ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
        : `Não consegui entrar: ${m}`;
    btn.disabled = false; btn.textContent = 'Entrar';
    return;
  }
  await boot();
});

$('#logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

async function boot(){
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) { $('#login').style.display='grid'; return; }
  S.user = user;
  const { data:perfil } = await sb.from('perfis').select('*').eq('id', user.id).maybeSingle();
  S.perfil = perfil || { nome:user.email, usuario:'?', papel:'leitor' };
  S.admin = S.perfil.papel === 'admin';

  $('#login').style.display = 'none';
  $('#app').classList.add('on');
  $('#uname').textContent = S.perfil.nome;
  $('#urole').textContent = S.admin ? 'Administrador' : 'Somente leitura';
  $('#avatar').textContent = (S.perfil.nome||'?').trim()[0].toUpperCase();

  buildNav(); buildPresets();
  await loadCadastros();
  window.addEventListener('hashchange', route);
  route();
}

async function loadCadastros(){
  const [so,em,ca,co,rg,ap] = await Promise.all([
    sb.from('socios').select('*').order('nome'),
    sb.from('empresas').select('*').order('grupo').order('nome'),
    sb.from('categorias').select('*').order('nome'),
    sb.from('contas_bancarias').select('*').order('banco'),
    sb.from('extrato_regras').select('*').order('ordem'),
    sb.from('acerto_postos').select('*').order('nome')
  ]);
  S.socios = so.data||[]; S.empresas = em.data||[]; S.categorias = ca.data||[]; S.contas = co.data||[];
  S.regras = rg.data||[]; S.acertoPostos = ap.data||[];
}

/* ============================================================
   SHELL
   ============================================================ */
function buildNav(){
  $('#nav').innerHTML = PAGES.map(p => p.sec
    ? `<div class="nav-sec">${esc(p.sec)}</div>`
    : `<a href="#${p.id}" data-p="${p.id}">${svg(p.icon,17)}<span>${esc(p.nome)}</span></a>`
  ).join('');
  $('#menuToggle').addEventListener('click', ()=> $('#side').classList.toggle('open'));
  $('#nav').addEventListener('click', ()=> $('#side').classList.remove('open'));
}

const PRESETS = [
  {id:'mes', nome:'Mês'}, {id:'trim', nome:'Trimestre'},
  {id:'ano', nome:'Ano'}, {id:'12m', nome:'12 meses'}, {id:'tudo', nome:'Tudo'}
];
function buildPresets(){
  $('#presets').innerHTML = PRESETS.map(p=>`<button data-k="${p.id}">${p.nome}</button>`).join('');
  $$('#presets button').forEach(b => b.addEventListener('click', ()=>{ applyPreset(b.dataset.k); render(); }));
  $('#dtFrom').addEventListener('change', ()=>{ S.from = $('#dtFrom').value; S.preset=null; markPreset(); render(); });
  $('#dtTo').addEventListener('change', ()=>{ S.to = $('#dtTo').value; S.preset=null; markPreset(); render(); });
  applyPreset('ano');
}
function applyPreset(k){
  const n = today(), y = n.getFullYear(), m = n.getMonth();
  let f, t = new Date(y, m+1, 0);
  if (k==='mes') f = new Date(y, m, 1);
  else if (k==='trim') f = new Date(y, m-2, 1);
  else if (k==='ano') f = new Date(y, 0, 1);
  else if (k==='12m') f = new Date(y, m-11, 1);
  else { f = new Date(2015,0,1); t = new Date(y+1,11,31); }
  S.preset = k; S.from = iso(f); S.to = iso(t);
  $('#dtFrom').value = S.from; $('#dtTo').value = S.to;
  markPreset();
}
function markPreset(){ $$('#presets button').forEach(b => b.classList.toggle('on', b.dataset.k===S.preset)); }

function route(){
  const id = (location.hash||'#dashboard').slice(1).split('?')[0];
  S.page = PAGES.some(p=>p.id===id) ? id : 'dashboard';
  const p = PAGES.find(x=>x.id===S.page);
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.p===S.page));
  $('#pageTitle').textContent = p.nome;
  $('#pageSub').textContent = p.sub;
  render();
}

function destroyCharts(){ Object.values(S.charts).forEach(c=>{try{c.destroy()}catch(e){}}); S.charts = {}; }

async function render(){
  destroyCharts();
  $('#view').innerHTML = '<div class="loading"><div class="spin"></div></div>';
  try {
    await ({
      dashboard: pageDashboard, vendas: pageVendas, aportes: pageAportes,
      retiradas: pageRetiradas, despesas: pageDespesas, receber: pageReceber, acerto: pageAcerto, creditos: pageCreditos,
      conciliacao: pageConciliacao,
      documentos: pageDocumentos, cadastros: pageCadastros
    })[S.page]();
  } catch(e){
    console.error(e);
    $('#view').innerHTML = `<div class="card"><div class="card-b"><b>Erro ao carregar.</b><p style="color:var(--text-muted);font-size:12.5px">${esc(e.message||e)}</p></div></div>`;
  }
}

const roNote = () => S.admin ? '' :
  `<div class="ro-note">${svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',15)} Seu acesso é somente leitura — lançamentos e edições estão desabilitados.</div>`;

/* ============================================================
   MODAL
   ============================================================ */
function openModal({title, sub='', body, footer, wide=false, onMount}){
  const m = $('#modal');
  m.className = 'modal' + (wide?' wide':'');
  m.innerHTML = `
    <div class="modal-h"><div style="flex:1"><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}</div>
      <button class="iconbtn" data-close>${svg('<path d="M18 6L6 18M6 6l12 12"/>',17)}</button></div>
    <div class="modal-b">${body}</div>
    <div class="modal-f">${footer||''}</div>`;
  $('#backdrop').classList.add('on');
  m.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', closeModal));
  onMount && onMount(m);
  formatarCampos(m);
  const first = m.querySelector('.modal-b input,.modal-b select,.modal-b textarea');
  first && setTimeout(()=>first.focus(), 60);
}
/* Campos de valor: sempre com duas casas decimais ao sair do campo.
   Digite 1000 e vira 1.000,00; digite 1000,5 e vira 1.000,50. */
function formatarCampos(root){
  root.querySelectorAll('[data-money], input[inputmode="decimal"]').forEach(el=>{
    if (el.dataset.fmt) return;
    el.dataset.fmt = '1';
    el.addEventListener('focus', () => setTimeout(()=>el.select(), 0));
    el.addEventListener('keypress', e => {
      if (e.key.length === 1 && !/[\d.,\-]/.test(e.key)) e.preventDefault();
    });
    el.addEventListener('blur', () => {
      const t = el.value.trim();
      if (!t) return;
      const n = parseMoney(t);
      el.value = isNaN(n) ? '' : NUM.format(n);
    });
  });
}

function closeModal(){ $('#backdrop').classList.remove('on'); $('#modal').innerHTML=''; }
$('#backdrop').addEventListener('mousedown', e => { if (e.target.id==='backdrop') closeModal(); });
document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

/* form field builders */
const fld = (label, inner, cls='') => `<div class="field ${cls}"><label>${esc(label)}</label>${inner}</div>`;
const inp = (name, type='text', val='', extra='') =>
  `<input name="${name}" type="${type}" value="${esc(val??'')}" ${extra}>`;
const sel = (name, opts, val='', extra='') =>
  `<select name="${name}" ${extra}>${opts.map(o=>`<option value="${esc(o.v)}"${String(o.v)===String(val??'')?' selected':''}>${esc(o.t)}</option>`).join('')}</select>`;
const txa = (name, val='', rows=2) => `<textarea name="${name}" rows="${rows}">${esc(val??'')}</textarea>`;

const optSocios = () => S.socios.map(s=>({v:s.id, t: s.e_empresa ? `${s.nome} (o próprio posto)` : s.nome}));
const optEmpresas = () => [{v:'',t:'—'}].concat(S.empresas.map(e=>({v:e.id,t:`${e.nome} · ${e.grupo}`})));
const optCategorias = () => [{v:'',t:'—'}].concat(S.categorias.map(c=>({v:c.id,t:c.nome})));
const optContas = () => [{v:'',t:'—'}].concat(S.contas.map(c=>({v:c.id,t:c.apelido||`${c.banco} ${c.conta||''}`})));

function formData(m){
  const o = {};
  m.querySelectorAll('[name]').forEach(el=>{
    let v = el.type==='checkbox' ? el.checked : el.value;
    if (el.dataset.money) v = parseMoney(v);
    if (v === '') v = null;
    o[el.name] = v;
  });
  return o;
}

async function save(table, payload, id){
  if (!S.admin) { toast('Acesso somente leitura.', true); return false; }
  payload.criado_por = S.user.id;
  const q = id ? sb.from(table).update(payload).eq('id', id) : sb.from(table).insert(payload);
  const { error } = await q;
  if (error) { toast(error.message, true); return false; }
  toast(id ? 'Registro atualizado.' : 'Registro salvo.');
  return true;
}
async function remove(table, id, label='registro'){
  if (!S.admin) { toast('Acesso somente leitura.', true); return; }
  if (!confirm(`Excluir este ${label}? Esta ação não pode ser desfeita.`)) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) return toast(error.message, true);
  toast('Excluído.'); render();
}

/* ============================================================
   CHART DEFAULTS
   ============================================================ */
Chart.defaults.font.family = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
Chart.defaults.font.size = 11.5;
Chart.defaults.color = INK.muted;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.animation.duration = 420;

const tooltipCfg = {
  backgroundColor:'#0f1b24', padding:11, cornerRadius:8, displayColors:true,
  boxWidth:9, boxHeight:9, boxPadding:4, usePointStyle:true,
  titleFont:{weight:'650',size:12}, bodyFont:{size:12}, bodySpacing:5,
  callbacks:{ label: c => ` ${c.dataset.label||c.label}: ${money(c.parsed.y ?? c.parsed)}` }
};
const axisMoney = {
  grid:{ color:INK.grid, drawTicks:false, drawBorder:false },
  border:{ display:false },
  ticks:{ padding:8, callback: v => moneyShort(v) }
};
const axisCat = {
  grid:{ display:false }, border:{ color:INK.base },
  ticks:{ padding:6 }
};

function legendHTML(items){
  return `<div class="legend">${items.map(i=>`<span><i style="background:${i.c}"></i>${esc(i.t)}${i.v!=null?` <b>${typeof i.v==='string'?i.v:money(i.v)}</b>`:''}</span>`).join('')}</div>`;
}

/* ============================================================
   DATA
   ============================================================ */
async function periodo(table, select='*', dateCol='data'){
  let q = sb.from(table).select(select).order(dateCol, {ascending:false});
  if (S.from) q = q.gte(dateCol, S.from);
  if (S.to)   q = q.lte(dateCol, S.to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
const sum = (arr, f='valor') => arr.reduce((a,b)=> a + (Number(b[f])||0), 0);
const byId = (arr, id) => arr.find(x=>x.id===id);
const nomeSocio = id => byId(S.socios,id)?.nome || '—';
const nomeEmpresa = id => { const e = byId(S.empresas,id); return e ? e.nome : '—'; };
const grupoEmpresa = id => byId(S.empresas,id)?.grupo || '—';
const CENTRO_CUSTO = { pessoal:'Pessoal', operacional:'Operacional', administrativa:'Administrativas',
  financeira:'Financeiras', tributaria:'Tributárias', investimento:'Investimento', outros:'Outros' };
const centroDe = id => CENTRO_CUSTO[byId(S.categorias,id)?.tipo] || 'Outros';
const nomeCategoria = id => byId(S.categorias,id)?.nome || 'Sem categoria';
const corSocio = (id,i=0) => byId(S.socios,id)?.cor || PAL[i%8];

function monthsRange(){
  const out = [], a = new Date(S.from+'T12:00'), b = new Date(S.to+'T12:00');
  let d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b && out.length < 72){ out.push(iso(d).slice(0,7)); d.setMonth(d.getMonth()+1); }
  return out;
}
function groupSum(rows, keyFn, valFn=r=>Number(r.valor)||0){
  const m = new Map();
  rows.forEach(r=>{ const k = keyFn(r); m.set(k, (m.get(k)||0) + valFn(r)); });
  return m;
}

/* ---------- card com toggle gráfico/tabela ---------- */
let _cardSeq = 0;
function vizCard({title, sub='', canvas, legend='', table, tall=false, actions=''}){
  const uid = 'vc'+(++_cardSeq);
  return `<div class="card" data-viz="${uid}">
    <div class="card-h">
      <div style="flex:1"><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}</div>
      ${actions}
      ${table?`<div class="seg" data-seg="${uid}">
        <button class="on" data-m="c">Gráfico</button><button data-m="t">Tabela</button></div>`:''}
    </div>
    <div class="card-b">
      <div data-pane="c-${uid}">
        <div class="chart-wrap${tall?' tall':''}"><canvas id="${canvas}"></canvas></div>
        ${legend}
      </div>
      ${table?`<div data-pane="t-${uid}" style="display:none"><div class="tablescroll">${table}</div></div>`:''}
    </div>
  </div>`;
}
function bindVizToggles(){
  $$('[data-seg]').forEach(seg=>{
    const uid = seg.dataset.seg;
    seg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b));
      $(`[data-pane="c-${uid}"]`).style.display = b.dataset.m==='c' ? '' : 'none';
      const t = $(`[data-pane="t-${uid}"]`); if (t) t.style.display = b.dataset.m==='t' ? '' : 'none';
    }));
  });
}

function miniTable(cols, rows, foot){
  return `<table><thead><tr>${cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.t)}</th>`).join('')}</tr></thead>
  <tbody>${rows.length?rows.map(r=>`<tr>${r.map((v,i)=>`<td class="${cols[i].num?'num':''}">${v}</td>`).join('')}</tr>`).join('')
    :`<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-muted);padding:24px">Sem dados no período.</td></tr>`}</tbody>
  ${foot?`<tfoot><tr>${foot.map((v,i)=>`<td class="${cols[i].num?'num':''}">${v}</td>`).join('')}</tr></tfoot>`:''}</table>`;
}

function tile(lbl, val, foot='', color=null, cls=''){
  return `<div class="card tile">
    <div class="lbl">${color?`<i style="background:${color}"></i>`:''}${esc(lbl)}</div>
    <div class="val ${cls}">${val}</div>
    ${foot?`<div class="foot">${foot}</div>`:''}
  </div>`;
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function pageDashboard(){
  const [ap, re, de, fa] = await Promise.all([
    periodo('aportes'), periodo('retiradas'), periodo('despesas'),
    periodo('faturamento','*','competencia')
  ]);

  const tFat = sum(fa,'faturamento_bruto');
  const tCmv = sum(fa,'custo_mercadoria');
  const tLB  = tFat - tCmv;
  const tDes = sum(de.filter(d=>d.status!=='cancelado'));
  const resultado = tLB - tDes;
  const tAp = sum(ap), tRe = sum(re);

  const meses = monthsRange();
  const mLB = groupSum(fa, r=>monthKey(r.competencia), r=>(Number(r.faturamento_bruto)||0)-(Number(r.custo_mercadoria)||0));
  const mFat = groupSum(fa, r=>monthKey(r.competencia), r=>Number(r.faturamento_bruto)||0);
  const mDe = groupSum(de.filter(d=>d.status!=='cancelado'), r=>monthKey(r.data));

  /* despesas por categoria — top 5 + outros */
  const catMap = [...groupSum(de.filter(d=>d.status!=='cancelado'), r=>nomeCategoria(r.categoria_id))]
    .sort((a,b)=>b[1]-a[1]);
  const top = catMap.slice(0,5);
  const restoV = catMap.slice(5).reduce((a,b)=>a+b[1],0);
  const catLabels = top.map(c=>c[0]).concat(restoV>0?['Outros']:[]);
  const catVals = top.map(c=>c[1]).concat(restoV>0?[restoV]:[]);

  /* por sócio */
  const socios = S.socios;
  const apS = socios.map(s=>sum(ap.filter(a=>a.socio_id===s.id)));
  const reS = socios.map(s=>sum(re.filter(a=>a.socio_id===s.id)));

  const kpiFoot = tFat ? `Margem bruta <b style="margin-left:3px">${pct(tLB,tFat)}</b>` : '';

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Faturamento bruto', money(tFat), `CMV ${moneyShort(tCmv)}`)}
      ${tile('Lucro bruto', money(tLB), kpiFoot, PAL[2])}
      ${tile('Despesas', money(tDes), `${de.length} lançamento${de.length===1?'':'s'}`, PAL[1])}
      ${tile('Resultado do período', money(resultado), tLB?`${pct(resultado,tLB)} do lucro bruto`:'', null, resultado>=0?'pos':'neg')}
    </div>
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Aportes no período', money(tAp), socios.map((s,i)=>`${esc(s.nome)} ${moneyShort(apS[i])}`).join(' · '), PAL[0])}
      ${tile('Retiradas no período', money(tRe), socios.map((s,i)=>`${esc(s.nome)} ${moneyShort(reS[i])}`).join(' · '), PAL[3])}
      ${tile('Saldo sócios (aporte − retirada)', money(tAp-tRe), '', null, (tAp-tRe)>=0?'pos':'neg')}
    </div>

    <div class="grid" style="grid-template-columns:1.55fr 1fr;margin-bottom:16px" id="row1">
      ${vizCard({
        title:'Lucro bruto × Despesas por mês',
        sub:'Colunas lado a lado, mesma escala',
        canvas:'chMes',
        legend: legendHTML([{c:PAL[2],t:'Lucro bruto',v:tLB},{c:PAL[1],t:'Despesas',v:tDes}]),
        table: miniTable(
          [{t:'Mês'},{t:'Faturamento',num:1},{t:'Lucro bruto',num:1},{t:'Despesas',num:1},{t:'Resultado',num:1}],
          meses.map(k=>{
            const lb = mLB.get(k)||0, d = mDe.get(k)||0;
            return [monthLabelLong(k), money(mFat.get(k)||0), money(lb), money(d),
              `<span class="${lb-d>=0?'pos':'neg'}">${money(lb-d)}</span>`];
          }),
          ['Total', money(tFat), money(tLB), money(tDes), `<span class="${resultado>=0?'pos':'neg'}">${money(resultado)}</span>`]
        )
      })}
      ${vizCard({
        title:'Despesas por categoria',
        sub:'Participação no total do período',
        canvas:'chCat',
        legend: legendHTML(catLabels.map((l,i)=>({c:PAL[i],t:l,v:catVals[i]}))),
        table: miniTable([{t:'Categoria'},{t:'Valor',num:1},{t:'%',num:1}],
          catMap.map(c=>[esc(c[0]), money(c[1]), pct(c[1],tDes)]), ['Total', money(tDes), '100%'])
      })}
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr" id="row2">
      ${vizCard({
        title:'Aportes × Retiradas por sócio',
        sub:'Capital colocado e retirado no período',
        canvas:'chSocio',
        legend: legendHTML([{c:PAL[0],t:'Aportes',v:tAp},{c:PAL[3],t:'Retiradas',v:tRe}]),
        table: miniTable([{t:'Sócio'},{t:'Aportes',num:1},{t:'Retiradas',num:1},{t:'Saldo',num:1}],
          socios.map((s,i)=>[esc(s.nome), money(apS[i]), money(reS[i]),
            `<span class="${apS[i]-reS[i]>=0?'pos':'neg'}">${money(apS[i]-reS[i])}</span>`]),
          ['Total', money(tAp), money(tRe), money(tAp-tRe)])
      })}
      ${vizCard({
        title:'Composição dos aportes',
        sub:'Por tipo de entrada de capital',
        canvas:'chTipo',
        legend:'',
        table: miniTable([{t:'Tipo'},{t:'Valor',num:1},{t:'%',num:1}],
          [...groupSum(ap, r=>TIPO_APORTE[r.tipo]||r.tipo)].sort((a,b)=>b[1]-a[1])
            .map(c=>[esc(c[0]), money(c[1]), pct(c[1],tAp)]), ['Total', money(tAp), '100%'])
      })}
    </div>`;

  bindVizToggles();

  /* --- chart 1: colunas agrupadas --- */
  S.charts.mes = new Chart($('#chMes'), {
    type:'bar',
    data:{ labels: meses.map(monthLabel), datasets:[
      { label:'Lucro bruto', data: meses.map(k=>mLB.get(k)||0), backgroundColor:PAL[2],
        borderRadius:{topLeft:4,topRight:4,bottomLeft:0,bottomRight:0}, borderSkipped:false,
        borderColor:INK.surface, borderWidth:{top:0,left:1,right:1,bottom:0}, maxBarThickness:26 },
      { label:'Despesas', data: meses.map(k=>mDe.get(k)||0), backgroundColor:PAL[1],
        borderRadius:{topLeft:4,topRight:4,bottomLeft:0,bottomRight:0}, borderSkipped:false,
        borderColor:INK.surface, borderWidth:{top:0,left:1,right:1,bottom:0}, maxBarThickness:26 }
    ]},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg},
      interaction:{mode:'index',intersect:false},
      scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
  });

  /* --- chart 2: pizza categorias --- */
  S.charts.cat = new Chart($('#chCat'), {
    type:'doughnut',
    data:{ labels:catLabels, datasets:[{ data:catVals,
      backgroundColor:catLabels.map((_,i)=>PAL[i]), borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{ label: c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,tDes)})` }}} }
  });

  /* --- chart 3: aportes x retiradas por sócio --- */
  S.charts.socio = new Chart($('#chSocio'), {
    type:'bar',
    data:{ labels: socios.map(s=>s.nome), datasets:[
      { label:'Aportes', data:apS, backgroundColor:PAL[0], borderRadius:{topLeft:4,topRight:4},
        borderSkipped:false, borderColor:INK.surface, borderWidth:{left:1,right:1}, maxBarThickness:52 },
      { label:'Retiradas', data:reS, backgroundColor:PAL[3], borderRadius:{topLeft:4,topRight:4},
        borderSkipped:false, borderColor:INK.surface, borderWidth:{left:1,right:1}, maxBarThickness:52 }
    ]},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg},
      scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
  });

  /* --- chart 4: composição dos aportes --- */
  const tipos = [...groupSum(ap, r=>TIPO_APORTE[r.tipo]||r.tipo)].sort((a,b)=>b[1]-a[1]);
  S.charts.tipo = new Chart($('#chTipo'), {
    type:'bar',
    data:{ labels: tipos.map(t=>t[0]), datasets:[{ label:'Aportes', data:tipos.map(t=>t[1]),
      backgroundColor:PAL[0], borderRadius:{topRight:4,bottomRight:4}, borderSkipped:false, maxBarThickness:24 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false}, tooltip:{...tooltipCfg,
        callbacks:{ label: c=>` ${money(c.parsed.x)} (${pct(c.parsed.x,tAp)})` }}},
      scales:{ x:{...axisMoney, beginAtZero:true}, y:{...axisCat, ticks:{padding:6, autoSkip:false}} } }
  });
}

/* ============================================================
   RÓTULOS
   ============================================================ */
const TIPO_APORTE = { dinheiro:'Dinheiro', capital_giro:'Capital de giro', carta_credito:'Carta de crédito', investimento:'Investimento', emprestimo:'Empréstimo', outro:'Outro' };
const TIPO_RETIRADA = { pro_labore:'Pró-labore', lucro:'Distribuição de lucro', adiantamento:'Adiantamento',
  reembolso:'Reembolso', investimento:'Investimento no posto', outro:'Outro' };
const STATUS_DESP = { pago:'Pago', a_pagar:'A pagar', cancelado:'Cancelado' };
const STATUS_COR = { pago:'var(--good)', a_pagar:'var(--warning)', cancelado:'var(--text-muted)' };
const TIPO_DOC = { extrato:'Extrato bancário', vendas:'Vendas × Faturamento', despesas:'Relatório de despesas', fiscal:'Fiscal / Contábil', contrato:'Contrato', obrigatorio:'Documentação obrigatória', outro:'Outro' };
const SEGMENTO = { combustiveis:'Combustíveis', conveniencia:'Conveniência', lubrificantes:'Lubrificantes', servicos:'Serviços', outros:'Outros' };
const opts = obj => Object.entries(obj).map(([v,t])=>({v,t}));

const btnNovo = (label, act) => S.admin
  ? `<button class="btn" data-act="${act}">${svg(I.plus,15)} ${esc(label)}</button>` : '';
const btnSec = (label, act, icon=I.up) => S.admin
  ? `<button class="btn ghost" data-act="${act}">${svg(icon,15)} ${esc(label)}</button>` : '';

const acts = id => S.admin ? `<div class="rowacts">
    <button class="iconbtn" data-edit="${id}" title="Editar">${svg(I.edit,15)}</button>
    <button class="iconbtn del" data-del="${id}" title="Excluir">${svg(I.trash,15)}</button>
  </div>` : '';

const emptyRow = (cols, txt='Nenhum lançamento no período selecionado.') =>
  `<tr><td colspan="${cols}"><div class="empty">${svg(I.inbox,38)}<p>${esc(txt)}</p></div></td></tr>`;

function wireSearch(){
  const inp = $('#q'); if (!inp) return;
  inp.addEventListener('input', ()=>{
    const v = inp.value.toLowerCase().trim();
    $$('#tbody tr[data-s]').forEach(tr=>{
      tr.style.display = !v || tr.dataset.s.includes(v) ? '' : 'none';
    });
  });
}
const toolbar = (extra='') => `<div class="toolbar">
  <div class="search">${svg(I.search,15)}<input id="q" placeholder="Buscar..."></div>
  <div class="spacer"></div>${extra}</div>`;

/* ============================================================
   APORTES
   ============================================================ */
async function pageAportes(){
  const rows = await periodo('aportes');
  const total = sum(rows);
  const meses = monthsRange();

  // quem aporta e socio; o proprio posto so recebe, entao nao aparece aqui
  const SOC = S.socios.filter(s => !s.e_empresa);
  const porSocio = SOC.map(s => ({ s, v: sum(rows.filter(r=>r.socio_id===s.id)) }));
  const tipos = [...groupSum(rows, r=>TIPO_APORTE[r.tipo]||r.tipo)].sort((a,b)=>b[1]-a[1]);

  // No que o dinheiro foi aplicado. Agrupa pela descricao do lancamento
  // ("compra do posto", "compra do caminhao"), ignorando maiuscula e acento,
  // para que pequenas variacoes de digitacao caiam na mesma linha.
  const chave = t => (t||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                      .toLowerCase().replace(/\s+/g,' ').trim();
  const SEM = '__sem__';
  const mapaDest = new Map();
  rows.forEach(r => {
    const k = chave(r.descricao) || SEM;
    if (!mapaDest.has(k)) mapaDest.set(k, { k, rotulo: r.descricao || 'Capital de giro / sem destino informado',
                                            v:0, n:0, porSocio:{} });
    const d = mapaDest.get(k);
    d.v += Number(r.valor||0); d.n++;
    d.porSocio[r.socio_id] = (d.porSocio[r.socio_id]||0) + Number(r.valor||0);
  });
  const destinos = [...mapaDest.values()].sort((a,b) =>
    (a.k===SEM) - (b.k===SEM) || b.v - a.v);
  const investido = destinos.filter(d=>d.k!==SEM).reduce((a,d)=>a+d.v,0);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Total aportado no período', money(total), `${rows.length} lançamento${rows.length===1?'':'s'}`)}
      ${porSocio.map((p,i)=>tile(`Sócio ${p.s.nome}`, money(p.v), total?`${pct(p.v,total)} do total`:'', p.s.cor||PAL[i])).join('')}
      ${investido ? tile('Aplicado em bens', money(investido),
        `Capital de giro e demais: ${money(total - investido)}`, PAL[2]) : ''}
    </div>

    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Aportes por mês', sub:'Empilhado por sócio', canvas:'chApMes',
        legend: legendHTML(porSocio.map((p,i)=>({c:p.s.cor||PAL[i], t:p.s.nome, v:p.v}))),
        table: miniTable([{t:'Mês'}].concat(SOC.map(s=>({t:s.nome,num:1}))).concat([{t:'Total',num:1}]),
          meses.map(k=>[monthLabelLong(k)].concat(SOC.map(s=>
            money(sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))))).concat([
            money(sum(rows.filter(r=>monthKey(r.data)===k)))])),
          ['Total'].concat(porSocio.map(p=>money(p.v))).concat([money(total)])) })}
      ${vizCard({ title:'Por tipo de aporte', sub:'Dinheiro, carta de crédito, investimento', canvas:'chApTipo',
        legend: legendHTML(tipos.map((t,i)=>({c:PAL[i], t:t[0], v:t[1]}))),
        table: miniTable([{t:'Tipo'},{t:'Valor',num:1},{t:'%',num:1}],
          tipos.map(t=>[esc(t[0]), money(t[1]), pct(t[1],total)]), ['Total', money(total),'100%']) })}
    </div>

    ${destinos.length ? `<div class="grid" style="grid-template-columns:1fr;margin-bottom:16px">
      ${vizCard({ title:'No que o dinheiro foi aplicado', tall:true,
        sub:'Pelo que está escrito na descrição do aporte',
        canvas:'chApDest',
        legend: legendHTML(destinos.map((d,i)=>({ c: d.k===SEM ? INK.base : PAL[i%8],
          t: d.rotulo, v: d.v }))),
        table: miniTable(
          [{t:'Destino'}].concat(SOC.map(s=>({t:s.nome,num:1}))).concat([{t:'Total',num:1},{t:'%',num:1}]),
          destinos.map(d => [esc(d.rotulo)]
            .concat(SOC.map(s => money(d.porSocio[s.id]||0)))
            .concat([money(d.v), pct(d.v,total)])),
          ['Total'].concat(SOC.map(s=>money(sum(rows.filter(r=>r.socio_id===s.id)))))
                   .concat([money(total),'100%'])) })}
    </div>` : ''}

    ${toolbar(btnNovo('Novo aporte','new'))}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Data</th><th>Sócio</th><th>Tipo</th><th>Descrição</th><th>Empresa</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(r=>`
        <tr data-s="${esc((brDate(r.data)+' '+nomeSocio(r.socio_id)+' '+(TIPO_APORTE[r.tipo]||'')+' '+(r.descricao||'')+' '+nomeEmpresa(r.empresa_id)).toLowerCase())}">
          <td>${brDate(r.data)}</td>
          <td><span class="pill"><i style="background:${corSocio(r.socio_id)}"></i>${esc(nomeSocio(r.socio_id))}</span></td>
          <td>${esc(TIPO_APORTE[r.tipo]||r.tipo)}</td>
          <td>${esc(r.descricao||'—')}${r.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.observacoes)}</div>`:''}</td>
          <td>${esc(nomeEmpresa(r.empresa_id))}</td>
          <td class="num"><b>${money(r.valor)}</b></td>
          <td>${acts(r.id)}</td></tr>`).join('') : emptyRow(7)}</tbody>
      ${rows.length?`<tfoot><tr><td colspan="5">Total do período</td><td class="num">${money(total)}</td><td></td></tr></tfoot>`:''}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  bindCrud('aportes', rows, formAporte);

  S.charts.apMes = new Chart($('#chApMes'), {
    type:'bar',
    data:{ labels: meses.map(monthLabel), datasets: SOC.map((s,i)=>({
      label:s.nome, data: meses.map(k=>sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))),
      backgroundColor: s.cor||PAL[i], borderColor:INK.surface, borderWidth:1, borderRadius:4, maxBarThickness:26 }))},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      // barras lado a lado: fica facil comparar um socio com o outro no mesmo mes
      datasets:{ bar:{ categoryPercentage:0.7, barPercentage:0.9 } },
      scales:{ x:{...axisCat, stacked:false}, y:{...axisMoney, stacked:false, beginAtZero:true} } }
  });
  if (destinos.length) S.charts.apDest = new Chart($('#chApDest'), {
    type:'bar',
    data:{ labels: destinos.map(d=>d.rotulo), datasets:[{ data: destinos.map(d=>d.v),
      backgroundColor: destinos.map((d,i)=> d.k===SEM ? INK.base : PAL[i%8]),
      borderColor:INK.surface, borderWidth:1, borderRadius:4, maxBarThickness:30 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${money(c.parsed.x)} (${pct(c.parsed.x,total)})`}}},
      scales:{ x:{...axisMoney, beginAtZero:true}, y:axisCat } }
  });
  S.charts.apTipo = new Chart($('#chApTipo'), {
    type:'doughnut',
    data:{ labels:tipos.map(t=>t[0]), datasets:[{ data:tipos.map(t=>t[1]),
      backgroundColor:tipos.map((_,i)=>PAL[i]), borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,total)})`}}} }
  });
}

function formAporte(r={}){
  openModal({
    title: r.id ? 'Editar aporte' : 'Novo aporte',
    sub: 'Capital colocado pelo sócio no posto',
    body: `<div class="frow">
      ${fld('Data', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Sócio', sel('socio_id', optSocios(), r.socio_id))}
      ${fld('Tipo', sel('tipo', opts(TIPO_APORTE), r.tipo||'dinheiro'))}
      ${fld('Valor (R$)', inp('valor','text', r.valor!=null?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Descrição', inp('descricao','text', r.descricao), 'full')}
      ${fld('Empresa / origem do recurso', sel('empresa_id', optEmpresas(), r.empresa_id), 'full')}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => $('#sv',m).addEventListener('click', async ()=>{
      const d = formData(m);
      if (!d.valor) return toast('Informe o valor.', true);
      if (await save('aportes', d, r.id)) { closeModal(); render(); }
    })
  });
}

/* ============================================================
   RETIRADAS
   ============================================================ */
async function pageRetiradas(){
  const rows = await periodo('retiradas');
  const ap = await periodo('aportes');
  const total = sum(rows);
  const meses = monthsRange();
  const porSocio = S.socios.map(s => ({ s, v: sum(rows.filter(r=>r.socio_id===s.id)),
    a: sum(ap.filter(r=>r.socio_id===s.id)) }));
  const tipos = [...groupSum(rows, r=>TIPO_RETIRADA[r.tipo]||r.tipo)].sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Total retirado no período', money(total), `${rows.length} lançamento${rows.length===1?'':'s'}`)}
      ${porSocio.map((p,i)=>tile(
        p.s.e_empresa ? 'Investido no próprio posto' : `Sócio ${p.s.nome}`,
        money(p.v),
        p.s.e_empresa
          ? 'Obra, equipamento, benfeitoria — não entra no resultado do mês'
          : `Saldo (aporte − retirada) <b style="margin-left:3px" class="${p.a-p.v>=0?'pos':'neg'}">${moneyShort(p.a-p.v)}</b>`,
        p.s.cor||PAL[i])).join('')}
    </div>

    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Retiradas por mês', sub:'Empilhado por sócio', canvas:'chReMes',
        legend: legendHTML(porSocio.map((p,i)=>({c:p.s.cor||PAL[i], t:p.s.nome, v:p.v}))),
        table: miniTable([{t:'Mês'}].concat(S.socios.map(s=>({t:s.nome,num:1}))).concat([{t:'Total',num:1}]),
          meses.map(k=>[monthLabelLong(k)].concat(S.socios.map(s=>
            money(sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))))).concat([
            money(sum(rows.filter(r=>monthKey(r.data)===k)))])),
          ['Total'].concat(porSocio.map(p=>money(p.v))).concat([money(total)])) })}
      ${vizCard({ title:'Por natureza da retirada', sub:'Pró-labore, lucro, adiantamento', canvas:'chReTipo',
        legend: legendHTML(tipos.map((t,i)=>({c:PAL[i], t:t[0], v:t[1]}))),
        table: miniTable([{t:'Tipo'},{t:'Valor',num:1},{t:'%',num:1}],
          tipos.map(t=>[esc(t[0]), money(t[1]), pct(t[1],total)]), ['Total', money(total),'100%']) })}
    </div>

    ${toolbar(btnNovo('Nova retirada','new'))}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Data</th><th>Destino</th><th>Natureza</th><th>Descrição</th><th>Empresa</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(r=>`
        <tr data-s="${esc((brDate(r.data)+' '+nomeSocio(r.socio_id)+' '+(TIPO_RETIRADA[r.tipo]||'')+' '+(r.descricao||'')).toLowerCase())}">
          <td>${brDate(r.data)}</td>
          <td><span class="pill"><i style="background:${corSocio(r.socio_id)}"></i>${esc(nomeSocio(r.socio_id))}</span></td>
          <td>${esc(TIPO_RETIRADA[r.tipo]||r.tipo)}</td>
          <td>${esc(r.descricao||'—')}${r.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.observacoes)}</div>`:''}</td>
          <td>${esc(nomeEmpresa(r.empresa_id))}</td>
          <td class="num"><b>${money(r.valor)}</b></td>
          <td>${acts(r.id)}</td></tr>`).join('') : emptyRow(7)}</tbody>
      ${rows.length?`<tfoot><tr><td colspan="5">Total do período</td><td class="num">${money(total)}</td><td></td></tr></tfoot>`:''}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  bindCrud('retiradas', rows, formRetirada);

  S.charts.reMes = new Chart($('#chReMes'), {
    type:'bar',
    data:{ labels: meses.map(monthLabel), datasets: S.socios.map((s,i)=>({
      label:s.nome, data: meses.map(k=>sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))),
      backgroundColor: s.cor||PAL[i], borderColor:INK.surface, borderWidth:1, borderRadius:4, maxBarThickness:26 }))},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      // barras lado a lado: fica facil comparar um socio com o outro no mesmo mes
      datasets:{ bar:{ categoryPercentage:0.7, barPercentage:0.9 } },
      scales:{ x:{...axisCat, stacked:false}, y:{...axisMoney, stacked:false, beginAtZero:true} } }
  });
  S.charts.reTipo = new Chart($('#chReTipo'), {
    type:'doughnut',
    data:{ labels:tipos.map(t=>t[0]), datasets:[{ data:tipos.map(t=>t[1]),
      backgroundColor:tipos.map((_,i)=>PAL[i]), borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,total)})`}}} }
  });
}

function formRetirada(r={}){
  openModal({
    title: r.id ? 'Editar retirada' : 'Nova retirada',
    sub: 'Saída para um sócio ou para o próprio posto',
    body: `<div class="frow">
      ${fld('Data', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Para quem', sel('socio_id', optSocios(), r.socio_id))}
      ${fld('Natureza', sel('tipo', opts(TIPO_RETIRADA), r.tipo||'pro_labore'))}
      ${fld('Valor (R$)', inp('valor','text', r.valor!=null?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Descrição', inp('descricao','text', r.descricao), 'full')}
      ${fld('Empresa pagadora', sel('empresa_id', optEmpresas(), r.empresa_id), 'full')}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => {
      // escolheu o proprio posto? entao a natureza natural e investimento
      const selD = m.querySelector('[name="socio_id"]'), selT = m.querySelector('[name="tipo"]');
      selD?.addEventListener('change', () => {
        if (r.id) return;                        // editando, respeita o que ja esta la
        const alvo = byId(S.socios, selD.value);
        if (alvo?.e_empresa) selT.value = 'investimento';
        else if (selT.value === 'investimento') selT.value = 'pro_labore';
      });
      $('#sv',m).addEventListener('click', async ()=>{
        const d = formData(m);
        if (!d.valor) return toast('Informe o valor.', true);
        if (await save('retiradas', d, r.id)) { closeModal(); render(); }
      });
    }
  });
}

function bindCrud(table, rows, form){
  $$('[data-act="new"]').forEach(b=>b.addEventListener('click', ()=>form({})));
  $$('[data-edit]').forEach(b=>b.addEventListener('click', ()=>form(rows.find(r=>r.id===b.dataset.edit)||{})));
  $$('[data-del]').forEach(b=>b.addEventListener('click', ()=>remove(table, b.dataset.del)));
}

/* ============================================================
   DESPESAS
   ============================================================ */
async function pageDespesas(){
  const rows = (await periodo('despesas'));
  const ativos = rows.filter(r=>r.status!=='cancelado');
  const total = sum(ativos);
  const pago = sum(ativos.filter(r=>r.status==='pago'));
  const aPagar = sum(ativos.filter(r=>r.status==='a_pagar'));
  const meses = monthsRange();

  const cats = [...groupSum(ativos, r=>nomeCategoria(r.categoria_id))].sort((a,b)=>b[1]-a[1]);

  // Resumo por categoria: salarios, encargos, taxas, energia, agua...
  const contas = [...groupSum(ativos, r=>nomeCategoria(r.categoria_id))].sort((a,b)=>b[1]-a[1]);
  const cTop = contas.slice(0,12), cResto = contas.slice(12).reduce((a,b)=>a+b[1],0);
  const cL = cTop.map(c=>c[0]).concat(cResto>0?['Demais']:[]);
  const cV = cTop.map(c=>c[1]).concat(cResto>0?[cResto]:[]);

  // E o centro de custo de verdade: a natureza de cada categoria
  const centros = [...groupSum(ativos, r=>centroDe(r.categoria_id))].sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Despesas do período', money(total), `${ativos.length} lançamento${ativos.length===1?'':'s'}`, PAL[1])}
      ${tile('Pago', money(pago), total?pct(pago,total)+' do total':'', 'var(--good)')}
      ${tile('A pagar', money(aPagar), total?pct(aPagar,total)+' do total':'', 'var(--warning)')}
      ${tile('Maior categoria', cats[0]?money(cats[0][1]):'—', cats[0]?esc(cats[0][0]):'')}
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Por centro de custo', sub:'Pessoal, operacional, administrativas, financeiras', canvas:'chDeCat',
        legend: legendHTML(centros.map((c,i)=>({c:PAL[i%8], t:c[0], v:c[1]}))),
        table: miniTable([{t:'Centro de custo'},{t:'Valor',num:1},{t:'%',num:1}],
          centros.map(c=>[esc(c[0]), money(c[1]), pct(c[1],total)]), ['Total', money(total),'100%']) })}
      ${vizCard({ title:'Resumo por tipo de despesa', sub:'Salários, encargos, taxas, energia, água...', canvas:'chDeConta', tall:true,
        legend: legendHTML(cL.map((l,i)=>({c: l==='Demais'?INK.base:PAL[i%8], t:l, v:cV[i]}))),
        table: miniTable([{t:'Tipo de despesa'},{t:'Valor',num:1},{t:'%',num:1}],
          contas.map(c=>[esc(c[0]), money(c[1]), pct(c[1],total)]), ['Total', money(total),'100%']) })}
    </div>

    <div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Evolução mensal das despesas', sub:'Total lançado por mês de competência', canvas:'chDeMes',
        legend: legendHTML([{c:PAL[1], t:'Despesas', v:total}]),
        table: miniTable([{t:'Mês'},{t:'Despesas',num:1},{t:'Lançamentos',num:1}],
          meses.map(k=>{ const f = ativos.filter(r=>monthKey(r.competencia||r.data)===k);
            return [monthLabelLong(k), money(sum(f)), String(f.length)]; }),
          ['Total', money(total), String(ativos.length)]) })}
    </div>

    ${toolbar(`${btnSec('Importar PDF','pdf')} ${btnNovo('Nova despesa','new')}`)}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Centro de custo</th><th>Status</th><th class="num">Valor</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(r=>`
        <tr data-s="${esc(((r.descricao||'')+' '+(r.fornecedor||'')+' '+nomeCategoria(r.categoria_id)+' '+nomeEmpresa(r.empresa_id)+' '+brDate(r.data)).toLowerCase())}">
          <td>${brDate(r.data)}</td>
          <td><b style="font-weight:600">${esc(r.descricao)}</b>
            ${r.fornecedor?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.fornecedor)}</div>`:''}
            ${r.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.observacoes)}</div>`:''}</td>
          <td>${esc(nomeCategoria(r.categoria_id))}</td>
          <td>${r.empresa_id?`<span class="pill">${esc(nomeEmpresa(r.empresa_id))}</span><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(grupoEmpresa(r.empresa_id))}</div>`:'—'}</td>
          <td><span class="pill"><i style="background:${STATUS_COR[r.status]}"></i>${esc(STATUS_DESP[r.status]||r.status)}</span></td>
          <td class="num"><b>${money(r.valor)}</b></td>
          <td>${acts(r.id)}</td></tr>`).join('') : emptyRow(7)}</tbody>
      ${rows.length?`<tfoot><tr><td colspan="5">Total do período (exceto cancelados)</td><td class="num">${money(total)}</td><td></td></tr></tfoot>`:''}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  bindCrud('despesas', rows, formDespesa);
  $$('[data-act="pdf"]').forEach(b=>b.addEventListener('click', importPdfDespesas));

  S.charts.deCat = new Chart($('#chDeCat'), {
    type:'doughnut',
    data:{ labels:centros.map(c=>c[0]), datasets:[{ data:centros.map(c=>c[1]),
      backgroundColor:centros.map((_,i)=>PAL[i%8]),
      borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,total)})`}}} }
  });
  S.charts.deConta = new Chart($('#chDeConta'), {
    type:'bar',
    data:{ labels: cL, datasets:[{ data: cV,
      backgroundColor: cL.map((l,i)=> l==='Demais' ? INK.base : PAL[i%8]),
      borderColor:INK.surface, borderWidth:1,
      borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, maxBarThickness:38 }]},
    options:{ plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${money(c.parsed.y)} (${pct(c.parsed.y,total)})`}}},
      scales:{ x:{...axisCat, ticks:{...(axisCat.ticks||{}), maxRotation:60, minRotation:45,
        callback(v){ const t = this.getLabelForValue(v); return t.length>18 ? t.slice(0,17)+'…' : t; }}},
        y:{...axisMoney, beginAtZero:true} } }
  });
  S.charts.deMes = new Chart($('#chDeMes'), {
    type:'bar',
    data:{ labels:meses.map(monthLabel), datasets:[{ label:'Despesas',
      data: meses.map(k=>sum(ativos.filter(r=>monthKey(r.competencia||r.data)===k))),
      backgroundColor:PAL[1], borderRadius:{topLeft:4,topRight:4}, borderSkipped:false,
      borderColor:INK.surface, borderWidth:{left:1,right:1}, maxBarThickness:38 }]},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg},
      scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
  });
}

function formDespesa(r={}){
  openModal({
    title: r.id ? 'Editar despesa' : 'Nova despesa',
    sub: 'Lançamento manual com centro de custo',
    body: `<div class="frow">
      ${fld('Data do pagamento', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Competência (mês)', inp('competencia','date', r.competencia||r.data||iso(new Date(today().getFullYear(), today().getMonth(), 1))))}
      ${fld('Descrição', inp('descricao','text', r.descricao, 'required placeholder="Ex.: Energia elétrica — Enel"'), 'full')}
      ${fld('Fornecedor', inp('fornecedor','text', r.fornecedor))}
      ${fld('Valor (R$)', inp('valor','text', r.valor!=null?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Categoria', sel('categoria_id', optCategorias(), r.categoria_id))}
      ${fld('Centro de custo (empresa pagadora)', sel('empresa_id', optEmpresas(), r.empresa_id))}
      ${fld('Forma de pagamento', inp('forma_pagamento','text', r.forma_pagamento, 'placeholder="Pix, boleto, cartão..."'))}
      ${fld('Status', sel('status', opts(STATUS_DESP), r.status||'pago'))}
      ${fld('Observações', txa('observacoes', r.observacoes, 3), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => $('#sv',m).addEventListener('click', async ()=>{
      const d = formData(m);
      if (!d.descricao) return toast('Informe a descrição.', true);
      if (!d.valor) return toast('Informe o valor.', true);
      if (await save('despesas', d, r.id)) { closeModal(); render(); }
    })
  });
}

/* ============================================================
   IMPORTAÇÃO DE PDF DE DESPESAS
   ============================================================ */
async function pdfLines(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const out = [];
  for (let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const map = new Map();
    tc.items.forEach(it=>{
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      const key = Math.round(y/3)*3;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({x: it.transform[4], s: it.str});
    });
    [...map.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,items])=>{
      const line = items.sort((a,b)=>a.x-b.x).map(i=>i.s).join(' ').replace(/\s+/g,' ').trim();
      if (line) out.push(line);
    });
  }
  return out;
}

const RE_DATE = /\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/;
const RE_VAL  = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})+,\d{2}|(?:R\$\s*)?-?\d+,\d{2}/g;
const IGNORE  = /^(total|subtotal|saldo|p[áa]gina|per[íi]odo|conta|ag[êe]ncia|cnpj|raz[ãa]o social|extrato|relat[óo]rio|data\s+(descri|hist))/i;

function guessLancamentos(lines, anoFallback){
  const out = [];
  lines.forEach(line => {
    if (line.length < 8) return;
    if (IGNORE.test(line.trim())) return;
    const vals = line.match(RE_VAL);
    if (!vals || !vals.length) return;
    const dm = line.match(RE_DATE);
    const valorStr = vals[vals.length-1];
    const valor = Math.abs(parseMoney(valorStr));
    if (!valor) return;
    let data = null;
    if (dm){
      let [_, d, m, y] = dm;
      y = y ? (y.length===2 ? '20'+y : y) : String(anoFallback);
      data = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data)) data = null;
    }
    let desc = line;
    if (dm) desc = desc.replace(dm[0],' ');
    vals.forEach(v=>{ desc = desc.replace(v,' '); });
    desc = desc.replace(/R\$/g,' ').replace(/\s{2,}/g,' ').replace(/^[\s|.\-–—:;]+|[\s|.\-–—:;]+$/g,'').trim();
    if (desc.length < 3) desc = 'Despesa importada';
    out.push({ data, descricao: desc.slice(0,180), valor, raw: line });
  });
  return out;
}

function palpiteCategoria(desc){
  const d = (desc||'').toLowerCase();
  const regras = [
    [/energia|enel|coelce|eletric|cemig|celpe|light/, 'Energia elétrica'],
    [/[áa]gua|cagece|saneam|sabesp|embasa/, 'Água'],
    [/internet|telefon|vivo|claro|tim|oi |net /, 'Internet e telefonia'],
    [/sal[áa]rio|folha|funcion[áa]rio|rescis|f[ée]rias|13[ºo]/, 'Folha de pagamento'],
    [/fgts|inss|encargo|vale.?transp|vale.?alim|benef/, 'Encargos e benefícios'],
    [/manuten|conserto|reparo|bomba|pintura|servi[çc]o t[ée]c/, 'Manutenção e reparos'],
    [/aluguel|loca[çc][ãa]o im[óo]v/, 'Aluguel'],
    [/contab|escrit[óo]rio cont|honor[áa]rio cont/, 'Contabilidade'],
    [/imposto|icms|pis|cofins|iss|irpj|csll|darf|das |taxa municipal|alvar[áa]/, 'Impostos e taxas'],
    [/cart[ãa]o|cielo|rede|getnet|stone|adquir|taxa adm/, 'Taxas de cartão'],
    [/tarifa|juros|iof|banc[áa]ri|manuten[çc][ãa]o de conta/, 'Juros e tarifas bancárias'],
    [/empr[ée]stimo|financ|presta[çc][ãa]o|parcela banco|consig/, 'Empréstimos / financiamentos'],
    [/marketing|publicid|an[úu]ncio|propagand|placa|brinde/, 'Marketing'],
    [/combust[íi]vel|gasolina|etanol|diesel|distribuidora|petrobras|ipiranga|raizen|vibra/, 'Combustível / Compra de produto'],
    [/seguro|ap[óo]lice/, 'Seguros'],
    [/obra|constru|reforma|benfeitor/, 'Obras e benfeitorias'],
    [/equipament|compressor|bomba nova|m[áa]quina/, 'Equipamentos'],
    [/papel|material de escrit|cartucho|toner/, 'Material de escritório']
  ];
  for (const [re, nome] of regras) if (re.test(d)){
    const c = S.categorias.find(x=>x.nome===nome); if (c) return c.id;
  }
  return '';
}

function importPdfDespesas(){
  const hoje = today();
  const compDefault = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  openModal({
    title:'Importar despesas de PDF',
    sub:'O sistema lê o arquivo, sugere os lançamentos e você confere antes de gravar',
    body:`
      <div class="frow" style="margin-bottom:16px">
        ${fld('Competência (mês de referência)', inp('competencia','date', compDefault))}
        ${fld('Centro de custo padrão', sel('empresa_id', optEmpresas(), ''))}
      </div>
      <div class="drop-zone" id="dz">
        ${svg(I.up,32)}
        <b>Solte o PDF aqui ou clique para escolher</b>
        <small>Relatório de despesas, boletos, fatura ou extrato em PDF</small>
        <input type="file" id="file" hidden>
      </div>
      <div id="pdfStatus" style="margin-top:14px"></div>`,
    footer:`<button class="btn ghost" data-close>Cancelar</button>`,
    wide:false,
    onMount: m => {
      const dz = $('#dz',m), f = $('#file',m);
      dz.addEventListener('click', ()=>f.click());
      dz.addEventListener('dragover', e=>{e.preventDefault(); dz.classList.add('over')});
      dz.addEventListener('dragleave', ()=>dz.classList.remove('over'));
      dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over');
        if (e.dataTransfer.files[0]) processarPdf(e.dataTransfer.files[0], m); });
      f.addEventListener('change', ()=>{ if (f.files[0]) processarPdf(f.files[0], m); });
    }
  });
}

async function processarPdf(file, m){
  const st = $('#pdfStatus', m);
  const competencia = m.querySelector('[name="competencia"]').value;
  const empresaPadrao = m.querySelector('[name="empresa_id"]').value;
  st.innerHTML = `<div style="display:flex;gap:9px;align-items:center;color:var(--text-secondary);font-size:13px"><span class="spin" style="border-color:var(--grid);border-top-color:var(--s1)"></span> Lendo <b>${esc(file.name)}</b>...</div>`;
  let lines = [];
  try { lines = await pdfLines(file); }
  catch(e){ st.innerHTML = `<div class="msg err">Não consegui ler este PDF (pode ser um arquivo escaneado sem texto). Erro: ${esc(e.message)}</div>`; return; }
  const ano = competencia ? +competencia.slice(0,4) : today().getFullYear();
  const itens = guessLancamentos(lines, ano);
  if (!itens.length){
    st.innerHTML = `<div class="msg err">Não encontrei lançamentos com data e valor neste PDF. Você pode lançar manualmente — o arquivo será guardado em Documentos.</div>`;
    return;
  }
  revisarLancamentos(itens, {competencia, empresaPadrao, file});
}

function revisarLancamentos(itens, ctx){
  const rowsHTML = itens.map((it,i)=>`
    <tr>
      <td><input type="checkbox" data-k="${i}" checked style="width:16px;height:16px;accent-color:var(--s1)"></td>
      <td><input class="dateinp" data-f="data" data-k="${i}" type="date" value="${it.data||ctx.competencia||''}" style="width:135px"></td>
      <td><input data-f="descricao" data-k="${i}" value="${esc(it.descricao)}" style="width:100%;min-width:220px;padding:6px 8px;border:1px solid var(--border);border-radius:7px"></td>
      <td><select data-f="categoria_id" data-k="${i}" style="padding:6px 8px;border:1px solid var(--border);border-radius:7px;max-width:180px">
        ${optCategorias().map(o=>`<option value="${o.v}"${o.v===palpiteCategoria(it.descricao)?' selected':''}>${esc(o.t)}</option>`).join('')}</select></td>
      <td><select data-f="empresa_id" data-k="${i}" style="padding:6px 8px;border:1px solid var(--border);border-radius:7px;max-width:180px">
        ${optEmpresas().map(o=>`<option value="${o.v}"${o.v===ctx.empresaPadrao?' selected':''}>${esc(o.t)}</option>`).join('')}</select></td>
      <td class="num"><input data-f="valor" data-k="${i}" value="${NUM.format(it.valor)}" inputmode="decimal" style="width:110px;text-align:right;padding:6px 8px;border:1px solid var(--border);border-radius:7px;font-variant-numeric:tabular-nums"></td>
    </tr>`).join('');

  openModal({
    title:'Conferir lançamentos identificados',
    sub:`${itens.length} linha${itens.length===1?'':'s'} encontrada${itens.length===1?'':'s'} — desmarque o que não for despesa e ajuste o que precisar`,
    wide:true,
    body:`<div class="toolbar" style="margin-bottom:10px">
        <button class="btn ghost sm" id="all">Marcar todos</button>
        <button class="btn ghost sm" id="none">Desmarcar todos</button>
        <div class="spacer"></div>
        <span style="font-size:12.5px;color:var(--text-secondary)">Selecionado: <b id="tot">—</b></span>
      </div>
      <div class="tablecard"><div class="tablescroll" style="max-height:44vh;overflow-y:auto"><table>
        <thead><tr><th style="width:36px"></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Centro de custo</th><th class="num">Valor</th></tr></thead>
        <tbody id="rev">${rowsHTML}</tbody></table></div></div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="guardar" checked style="width:16px;height:16px;accent-color:var(--s1)">
        Guardar o PDF original na aba Documentos e vincular às despesas
      </label>`,
    footer:`<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="imp">Importar selecionados</button>`,
    onMount: m => {
      const calc = ()=>{
        let t=0;
        m.querySelectorAll('#rev input[type=checkbox]').forEach(cb=>{
          if (cb.checked) t += parseMoney(m.querySelector(`[data-f="valor"][data-k="${cb.dataset.k}"]`).value);
        });
        $('#tot',m).textContent = money(t);
      };
      m.querySelectorAll('#rev input,#rev select').forEach(el=>el.addEventListener('change',calc));
      $('#all',m).addEventListener('click',()=>{m.querySelectorAll('#rev input[type=checkbox]').forEach(c=>c.checked=true);calc()});
      $('#none',m).addEventListener('click',()=>{m.querySelectorAll('#rev input[type=checkbox]').forEach(c=>c.checked=false);calc()});
      calc();

      $('#imp',m).addEventListener('click', async ()=>{
        const btn = $('#imp',m); btn.disabled = true; btn.innerHTML='<span class="spin"></span>';
        let documento_id = null;
        if ($('#guardar',m).checked){
          const doc = await uploadDocumento(ctx.file, {
            competencia: ctx.competencia || iso(today()),
            tipo:'despesas', titulo:`Despesas — ${ctx.file.name}`
          });
          documento_id = doc?.id || null;
        }
        const payload = [];
        m.querySelectorAll('#rev input[type=checkbox]').forEach(cb=>{
          if (!cb.checked) return;
          const k = cb.dataset.k, g = f => m.querySelector(`[data-f="${f}"][data-k="${k}"]`).value;
          payload.push({
            data: g('data') || ctx.competencia,
            competencia: ctx.competencia || null,
            descricao: g('descricao'),
            categoria_id: g('categoria_id') || null,
            empresa_id: g('empresa_id') || null,
            valor: parseMoney(g('valor')),
            status:'pago', origem:'pdf', documento_id,
            criado_por: S.user.id
          });
        });
        if (!payload.length){ toast('Nenhum lançamento selecionado.', true); btn.disabled=false; btn.textContent='Importar selecionados'; return; }
        const { error } = await sb.from('despesas').insert(payload);
        if (error){ toast(error.message, true); btn.disabled=false; btn.textContent='Importar selecionados'; return; }
        toast(`${payload.length} despesa${payload.length===1?'':'s'} importada${payload.length===1?'':'s'}.`);
        closeModal(); render();
      });
    }
  });
}

/* ---------- upload storage ---------- */
async function uploadDocumento(file, meta){
  const safe = file.name.replace(/[^\w.\-]+/g,'_');
  const path = `${(meta.competencia||iso(today())).slice(0,7)}/${Date.now()}_${safe}`;
  const { error:upErr } = await sb.storage.from('documentos').upload(path, file, {upsert:false});
  if (upErr){ toast('Falha no upload: '+upErr.message, true); return null; }
  const { data, error } = await sb.from('documentos').insert({
    competencia: meta.competencia, tipo: meta.tipo||'outro',
    titulo: meta.titulo || file.name, arquivo_path: path, arquivo_nome: file.name,
    tamanho: file.size, observacoes: meta.observacoes||null, criado_por: S.user.id
  }).select().single();
  if (error){ toast(error.message, true); return null; }
  return data;
}

/* ============================================================
   VENDAS × LUCRO BRUTO
   ============================================================ */
async function pageVendas(){
  const [rows, todos, de] = await Promise.all([
    periodo('faturamento','*','competencia'),
    sb.from('faturamento').select('*').order('competencia').then(r=>r.data||[]),
    periodo('despesas')
  ]);

  const tFat = sum(rows,'faturamento_bruto'), tCmv = sum(rows,'custo_mercadoria');
  const tLB = tFat - tCmv;
  const tDes = sum(de.filter(d=>d.status!=='cancelado'));
  const meses = monthsRange();

  const mFat = groupSum(rows, r=>monthKey(r.competencia), r=>Number(r.faturamento_bruto)||0);
  const mCmv = groupSum(rows, r=>monthKey(r.competencia), r=>Number(r.custo_mercadoria)||0);

  /* comparativo com o mesmo intervalo do ano anterior */
  const mesesAnt = meses.map(k=>{ const [y,m]=k.split('-'); return `${+y-1}-${m}`; });
  const allFat = groupSum(todos, r=>monthKey(r.competencia), r=>Number(r.faturamento_bruto)||0);
  const allLB  = groupSum(todos, r=>monthKey(r.competencia), r=>(Number(r.faturamento_bruto)||0)-(Number(r.custo_mercadoria)||0));
  const fatAnt = mesesAnt.reduce((a,k)=>a+(allFat.get(k)||0),0);
  const lbAnt  = mesesAnt.reduce((a,k)=>a+(allLB.get(k)||0),0);
  const varFat = fatAnt ? (tFat-fatAnt)/fatAnt*100 : null;

  const segs = [...groupSum(rows, r=>SEGMENTO[r.segmento]||r.segmento, r=>Number(r.faturamento_bruto)||0)]
    .sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Faturamento bruto', money(tFat),
        varFat==null?'Sem base do ano anterior':`<span class="${varFat>=0?'pos':'neg'}">${varFat>=0?'▲':'▼'} ${Math.abs(varFat).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span> vs mesmo período do ano anterior`, PAL[0])}
      ${tile('Custo da mercadoria (CMV)', money(tCmv), tFat?pct(tCmv,tFat)+' do faturamento':'', PAL[1])}
      ${tile('Lucro bruto', money(tLB), lbAnt?`Ano anterior ${moneyShort(lbAnt)}`:'', PAL[2])}
      ${tile('Margem bruta', tFat?pct(tLB,tFat):'—', `Resultado após despesas <b style="margin-left:3px" class="${tLB-tDes>=0?'pos':'neg'}">${moneyShort(tLB-tDes)}</b>`)}
    </div>

    <div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Faturamento × Lucro bruto por mês', sub:'Mesma escala, colunas lado a lado', canvas:'chVeMes', tall:true,
        legend: legendHTML([{c:PAL[0],t:'Faturamento bruto',v:tFat},{c:PAL[2],t:'Lucro bruto',v:tLB}]),
        table: miniTable([{t:'Mês'},{t:'Faturamento',num:1},{t:'CMV',num:1},{t:'Lucro bruto',num:1},{t:'Margem',num:1}],
          meses.map(k=>{ const f=mFat.get(k)||0, c=mCmv.get(k)||0;
            return [monthLabelLong(k), money(f), money(c), money(f-c), pct(f-c,f)]; }),
          ['Total', money(tFat), money(tCmv), money(tLB), pct(tLB,tFat)]) })}
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Margem bruta por mês', sub:'Percentual do faturamento que vira lucro bruto', canvas:'chVeMargem',
        legend: legendHTML([{c:PAL[2],t:'Margem bruta',v:tFat?pct(tLB,tFat):'—'}]),
        table: miniTable([{t:'Mês'},{t:'Margem',num:1},{t:'Lucro bruto',num:1}],
          meses.map(k=>{ const f=mFat.get(k)||0, c=mCmv.get(k)||0;
            return [monthLabelLong(k), pct(f-c,f), money(f-c)]; })) })}
      ${vizCard({ title:'Faturamento por segmento', sub:'Combustíveis, conveniência e serviços', canvas:'chVeSeg',
        legend: legendHTML(segs.map((s,i)=>({c:PAL[i], t:s[0], v:s[1]}))),
        table: miniTable([{t:'Segmento'},{t:'Faturamento',num:1},{t:'%',num:1}],
          segs.map(s=>[esc(s[0]), money(s[1]), pct(s[1],tFat)]), ['Total', money(tFat), '100%']) })}
    </div>

    <div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Comparativo entre períodos', sub:'Faturamento deste período × mesmo intervalo do ano anterior', canvas:'chVeComp',
        legend: legendHTML([{c:PAL[0],t:'Período atual',v:tFat},{c:PAL[4],t:'Ano anterior',v:fatAnt}]),
        table: miniTable([{t:'Mês'},{t:'Atual',num:1},{t:'Ano anterior',num:1},{t:'Variação',num:1}],
          meses.map((k,i)=>{ const a=allFat.get(k)||0, b=allFat.get(mesesAnt[i])||0;
            const v = b? (a-b)/b*100 : null;
            return [monthLabelLong(k), money(a), money(b),
              v==null?'—':`<span class="${v>=0?'pos':'neg'}">${v>=0?'+':''}${v.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span>`]; }),
          ['Total', money(tFat), money(fatAnt), varFat==null?'—':`<span class="${varFat>=0?'pos':'neg'}">${varFat>=0?'+':''}${varFat.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</span>`]) })}
    </div>

    ${toolbar(btnNovo('Lançar vendas do mês','new'))}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Competência</th><th>Segmento</th><th class="num">Faturamento</th><th class="num">CMV</th><th class="num">Lucro bruto</th><th class="num">Margem</th><th class="num">Litros</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(r=>{
        const lb = (Number(r.faturamento_bruto)||0)-(Number(r.custo_mercadoria)||0);
        return `<tr data-s="${esc((monthLabelLong(monthKey(r.competencia))+' '+(SEGMENTO[r.segmento]||'')).toLowerCase())}">
          <td><b style="font-weight:600">${monthLabelLong(monthKey(r.competencia))}</b></td>
          <td><span class="pill">${esc(SEGMENTO[r.segmento]||r.segmento)}</span></td>
          <td class="num">${money(r.faturamento_bruto)}</td>
          <td class="num">${money(r.custo_mercadoria)}</td>
          <td class="num"><b class="${lb>=0?'pos':''}">${money(lb)}</b></td>
          <td class="num">${pct(lb, r.faturamento_bruto)}</td>
          <td class="num">${r.volume_litros?NUM.format(r.volume_litros):'—'}</td>
          <td>${acts(r.id)}</td></tr>`;}).join('') : emptyRow(8,'Nenhum lançamento de vendas no período.')}</tbody>
      ${rows.length?`<tfoot><tr><td colspan="2">Total do período</td><td class="num">${money(tFat)}</td><td class="num">${money(tCmv)}</td><td class="num">${money(tLB)}</td><td class="num">${pct(tLB,tFat)}</td><td colspan="2"></td></tr></tfoot>`:''}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  bindCrud('faturamento', rows, formVendas);

  const barBase = { borderColor:INK.surface, borderWidth:{left:1,right:1}, borderSkipped:false,
    borderRadius:{topLeft:4,topRight:4}, maxBarThickness:30 };

  S.charts.veMes = new Chart($('#chVeMes'), {
    type:'bar',
    data:{ labels:meses.map(monthLabel), datasets:[
      {...barBase, label:'Faturamento bruto', data:meses.map(k=>mFat.get(k)||0), backgroundColor:PAL[0]},
      {...barBase, label:'Lucro bruto', data:meses.map(k=>(mFat.get(k)||0)-(mCmv.get(k)||0)), backgroundColor:PAL[2]}
    ]},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
  });

  S.charts.veMargem = new Chart($('#chVeMargem'), {
    type:'line',
    data:{ labels:meses.map(monthLabel), datasets:[{ label:'Margem bruta',
      data: meses.map(k=>{ const f=mFat.get(k)||0; return f ? ((f-(mCmv.get(k)||0))/f*100) : null; }),
      borderColor:PAL[2], backgroundColor:'rgba(27,175,122,.10)', borderWidth:2, fill:true,
      pointRadius:4, pointBackgroundColor:PAL[2], pointBorderColor:INK.surface, pointBorderWidth:2,
      pointHoverRadius:6, tension:.32, spanGaps:true }]},
    options:{ plugins:{legend:{display:false}, tooltip:{...tooltipCfg,
        callbacks:{label:c=>` Margem: ${c.parsed.y==null?'—':c.parsed.y.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}`}}},
      interaction:{mode:'index',intersect:false},
      scales:{ x:axisCat, y:{ ...axisMoney, beginAtZero:true,
        ticks:{padding:8, callback:v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0})+'%'} } } }
  });

  S.charts.veSeg = new Chart($('#chVeSeg'), {
    type:'doughnut',
    data:{ labels:segs.map(s=>s[0]), datasets:[{ data:segs.map(s=>s[1]),
      backgroundColor:segs.map((_,i)=>PAL[i]), borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,tFat)})`}}} }
  });

  S.charts.veComp = new Chart($('#chVeComp'), {
    type:'bar',
    data:{ labels:meses.map(monthLabel), datasets:[
      {...barBase, label:'Período atual', data:meses.map(k=>allFat.get(k)||0), backgroundColor:PAL[0]},
      {...barBase, label:'Ano anterior', data:mesesAnt.map(k=>allFat.get(k)||0), backgroundColor:PAL[4]}
    ]},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
  });
}

function formVendas(r={}){
  const comp = r.competencia || iso(new Date(today().getFullYear(), today().getMonth(), 1));
  openModal({
    title: r.id ? 'Editar lançamento de vendas' : 'Lançar vendas do mês',
    sub: 'Faturamento bruto e custo da mercadoria vendida',
    body: `<div class="frow">
      ${fld('Competência (use o dia 1º do mês)', inp('competencia','date', comp, 'required'))}
      ${fld('Segmento', sel('segmento', opts(SEGMENTO), r.segmento||'combustiveis'))}
      ${fld('Faturamento bruto (R$)', inp('faturamento_bruto','text', r.faturamento_bruto!=null?NUM.format(r.faturamento_bruto):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Custo da mercadoria — CMV (R$)', inp('custo_mercadoria','text', r.custo_mercadoria!=null?NUM.format(r.custo_mercadoria):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Volume (litros)', inp('volume_litros','text', r.volume_litros!=null?NUM.format(r.volume_litros):'', 'inputmode="decimal"'))}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>
    <div style="margin-top:6px;padding:11px 13px;background:var(--surface-2);border-radius:9px;font-size:12.5px;color:var(--text-secondary)">
      O lucro bruto é calculado automaticamente: <b>faturamento − CMV</b>. Um registro por mês e segmento.
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => $('#sv',m).addEventListener('click', async ()=>{
      const d = formData(m);
      d.faturamento_bruto = d.faturamento_bruto||0;
      d.custo_mercadoria = d.custo_mercadoria||0;
      d.volume_litros = d.volume_litros ? parseMoney(d.volume_litros) : null;
      if (!d.competencia) return toast('Informe a competência.', true);
      d.competencia = d.competencia.slice(0,8)+'01';
      if (await save('faturamento', d, r.id)) { closeModal(); render(); }
    })
  });
}

/* ============================================================
   CONTAS A RECEBER
   ============================================================ */
const FAIXAS = [
  { t:'Até 30 dias',   min:0,   max:30,  c:PAL[2] },
  { t:'31 a 60 dias',  min:31,  max:60,  c:PAL[3] },
  { t:'61 a 90 dias',  min:61,  max:90,  c:PAL[1] },
  { t:'Mais de 90',    min:91,  max:1e9, c:PAL[7] }
];

const diasDe = s => {
  if (!s) return 0;
  const a = new Date(String(s).slice(0,10) + 'T00:00:00');
  const h = new Date(); h.setHours(0,0,0,0);
  return Math.round((h - a) / 86400000);   // dias inteiros de calendario
};

async function pageReceber(){
  const R = S.sub.rec = S.sub.rec || { vis:'cliente', usarPeriodo:false };
  if (R.usarPeriodo === undefined) R.usarPeriodo = false;

  let q = sb.from('contas_receber').select('*')
    .in('situacao', ['aberto','parcial'])
    .gt('valor_aberto', 0)
    .order('data', { ascending:false });
  // por padrao mostra TUDO que esta em aberto, mesmo de anos anteriores —
  // titulo antigo esquecido e justamente o que nao pode sumir da tela
  if (R.usarPeriodo) {
    if (S.from) q = q.gte('data', S.from);
    if (S.to)   q = q.lte('data', S.to);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];

  const hoje = new Date().toISOString().slice(0,10);
  const vencido  = r => r.vencimento && r.vencimento < hoje;
  const total    = sum(rows, 'valor_aberto');
  const tVencido = sum(rows.filter(vencido), 'valor_aberto');
  const tAVencer = total - tVencido;

  // por cliente
  const porCliente = [...groupSum(rows, r=>r.cliente, r=>Number(r.valor_aberto)||0)]
    .map(([cliente, v]) => {
      const meus = rows.filter(r=>r.cliente===cliente);
      return { cliente, v, n: meus.length,
               venc: sum(meus.filter(vencido),'valor_aberto'),
               antiga: meus.reduce((a,r)=> !a || r.data < a ? r.data : a, null) };
    })
    .sort((a,b)=>b.v-a.v);

  // idade do título, contada da data da conta
  const porFaixa = FAIXAS.map(f => {
    const meus = rows.filter(r=>{ const d = diasDe(r.data); return d >= f.min && d <= f.max; });
    return { ...f, v: sum(meus,'valor_aberto'), n: meus.length };
  });

  const top = porCliente.slice(0, 8);
  const outros = porCliente.slice(8);
  const vOutros = outros.reduce((a,c)=>a+c.v, 0);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Total em aberto', money(total), `${rows.length} título${rows.length===1?'':'s'} · ${porCliente.length} cliente${porCliente.length===1?'':'s'}`, PAL[0])}
      ${tile('Vencido', money(tVencido), rows.length?`${pct(tVencido,total)} do total em aberto`:'', PAL[7], tVencido>0?'neg':'')}
      ${tile('A vencer', money(tAVencer), rows.length?`${pct(tAVencer,total)} do total em aberto`:'', PAL[2])}
      ${tile('Maior devedor', porCliente[0] ? money(porCliente[0].v) : '—',
             porCliente[0] ? esc(porCliente[0].cliente) : '', PAL[4])}
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
          <input type="checkbox" id="cbPer" ${R.usarPeriodo?'checked':''} style="margin-top:2px;width:16px;height:16px;accent-color:var(--s1)">
          <span>
            <b style="font-size:13px">Limitar ao período escolhido lá em cima</b>
            <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px">
              Desmarcado, a tela mostra <b>tudo que está em aberto</b>, de qualquer data — inclusive título antigo,
              que é o que não pode sumir da cobrança.</span>
          </span>
        </label>
      </div>
      <div style="font-size:12.5px;color:var(--text-muted);text-align:right;min-width:180px">
        ${R.usarPeriodo ? `mostrando contas de <b>${brDate(S.from)}</b> a <b>${brDate(S.to)}</b>`
                        : 'mostrando <b>todos</b> os títulos em aberto'}
      </div>
    </div></div>

    <div class="msg info" style="margin-bottom:16px">
      Só aparece o que <b>ainda não foi recebido</b>, contado pela <b>data da conta</b> — não pelo vencimento.
      Isto é dinheiro a entrar, não resultado: <b>não entra no lucro do DRE</b>, que já registrou a venda quando ela aconteceu.
    </div>

    ${rows.length?`<div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Quem mais deve', sub:'Saldo em aberto por cliente', canvas:'chRecCli', tall:true,
        legend: legendHTML(top.slice(0,4).map((c,i)=>({c:PAL[i%8], t:c.cliente, v:c.v}))),
        table: miniTable([{t:'Cliente'},{t:'Títulos',num:1},{t:'Vencido',num:1},{t:'Em aberto',num:1}],
          porCliente.map(c=>[esc(c.cliente), String(c.n),
            c.venc>0?`<span class="neg">${money(c.venc)}</span>`:'—', money(c.v)]),
          ['Total', String(rows.length), money(tVencido), money(total)]) })}

      ${vizCard({ title:'Idade dos títulos', sub:'Tempo desde a data da conta', canvas:'chRecIdade',
        legend: legendHTML(porFaixa.map(f=>({c:f.c, t:f.t, v:f.v}))),
        table: miniTable([{t:'Faixa'},{t:'Títulos',num:1},{t:'Em aberto',num:1},{t:'% do total',num:1}],
          porFaixa.map(f=>[f.t, String(f.n), money(f.v), pct(f.v,total)]),
          ['Total', String(rows.length), money(total), '100%']) })}
    </div>`:''}

    <div class="sub-tabs">
      <button data-v="cliente" class="${R.vis==='cliente'?'on':''}">Por cliente</button>
      <button data-v="titulo"  class="${R.vis==='titulo'?'on':''}">Título a título</button>
    </div>

    ${toolbar('')}
    <div class="tablecard"><div class="tablescroll"><table>
      ${R.vis==='cliente' ? `
        <thead><tr><th>Cliente</th><th class="num">Títulos</th><th>Conta mais antiga</th>
          <th class="num">Vencido</th><th class="num">Em aberto</th></tr></thead>
        <tbody id="tbody">${porCliente.length ? porCliente.map(c=>`
          <tr data-s="${esc(c.cliente.toLowerCase())}">
            <td><b style="font-weight:600">${esc(c.cliente)}</b></td>
            <td class="num">${c.n}</td>
            <td>${brDate(c.antiga)} <span style="color:var(--text-muted);font-size:11.5px">· ${diasDe(c.antiga)} dias</span></td>
            <td class="num">${c.venc>0?`<b class="neg">${money(c.venc)}</b>`:'—'}</td>
            <td class="num"><b>${money(c.v)}</b></td>
          </tr>`).join('') : emptyRow(5,'Nenhum título em aberto no período.')}</tbody>
        ${porCliente.length?`<tfoot><tr><td>Total</td><td class="num">${rows.length}</td><td></td>
          <td class="num">${money(tVencido)}</td><td class="num">${money(total)}</td></tr></tfoot>`:''}
      ` : `
        <thead><tr><th>Data da conta</th><th>Vencimento</th><th>Cliente</th><th>Documento</th>
          <th class="num">Valor</th><th class="num">Recebido</th><th class="num">Em aberto</th><th>Situação</th></tr></thead>
        <tbody id="tbody">${rows.length ? rows.map(r=>`
          <tr data-s="${esc(((r.cliente||'')+' '+(r.historico||'')+' '+(r.documento||'')+' '+brDate(r.data)).toLowerCase())}">
            <td>${brDate(r.data)}</td>
            <td>${r.vencimento?`${brDate(r.vencimento)}${vencido(r)?` <span class="neg" style="font-size:11.5px">· ${diasDe(r.vencimento)}d</span>`:''}`:'—'}</td>
            <td><b style="font-weight:600">${esc(r.cliente)}</b>${r.historico?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.historico)}</div>`:''}</td>
            <td>${esc(r.documento||'—')}${r.placa?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(r.placa)}</div>`:''}</td>
            <td class="num">${money(r.valor)}</td>
            <td class="num">${Number(r.valor_pago)>0?money(r.valor_pago):'—'}</td>
            <td class="num"><b>${money(r.valor_aberto)}</b></td>
            <td><span class="pill"><i style="background:${vencido(r)?'var(--critical)':'var(--warning)'}"></i>${vencido(r)?'Vencido':'A vencer'}</span></td>
          </tr>`).join('') : emptyRow(8,'Nenhum título em aberto no período.')}</tbody>
        ${rows.length?`<tfoot><tr><td colspan="6">Total em aberto</td>
          <td class="num">${money(total)}</td><td></td></tr></tfoot>`:''}
      `}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  $$('.sub-tabs button').forEach(b=>b.addEventListener('click',()=>{ R.vis = b.dataset.v; render(); }));
  $('#cbPer')?.addEventListener('change', e=>{ R.usarPeriodo = e.target.checked; render(); });

  if (rows.length){
    const labels = top.map(c=>c.cliente).concat(vOutros>0?['Outros clientes']:[]);
    const vals   = top.map(c=>c.v).concat(vOutros>0?[vOutros]:[]);
    S.charts.recCli = new Chart($('#chRecCli'), {
      type:'bar',
      data:{ labels, datasets:[{ data:vals,
        backgroundColor: labels.map((_,i)=> i>=top.length ? INK.base : PAL[i%8]),
        borderColor:INK.surface, borderWidth:1, borderRadius:4, maxBarThickness:24 }]},
      options:{ indexAxis:'y', plugins:{legend:{display:false}, tooltip:tooltipCfg},
        scales:{ x:{...axisMoney, beginAtZero:true}, y:axisCat } }
    });
    S.charts.recIdade = new Chart($('#chRecIdade'), {
      type:'bar',
      data:{ labels: porFaixa.map(f=>f.t), datasets:[{ data: porFaixa.map(f=>f.v),
        backgroundColor: porFaixa.map(f=>f.c), borderColor:INK.surface, borderWidth:1,
        borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, maxBarThickness:44 }]},
      options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg},
        scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
    });
  }
}

/* ============================================================
   ACERTO DE CONTAS COM OS POSTOS DO GRUPO
   O Garra tem sócio; os outros postos são só do Guilherme.
   Tudo vira movimento com direção:
     saiu   = saiu do Garra   -> o posto passa a dever ao Garra
     entrou = entrou no Garra -> o Garra passa a dever ao posto
   Com o valor por litro, o combustível entra no mesmo saldo em reais.
   ============================================================ */
const PRODUTO = { gasolina_comum:'Gasolina comum', gasolina_aditivada:'Gasolina aditivada',
  etanol:'Etanol', diesel_s10:'Diesel S10', diesel_s500:'Diesel S500', outro:'Outro' };
const PROD_COR = { gasolina_comum:PAL[3], gasolina_aditivada:PAL[0], etanol:PAL[2],
  diesel_s10:PAL[6], diesel_s500:PAL[5], outro:PAL[4] };

const nomePosto = id => byId(S.acertoPostos||[], id)?.nome || '—';
const optPostos = () => (S.acertoPostos||[]).filter(p=>p.ativo)
  .map(p=>({v:p.id,t:p.nome})).sort((a,b)=>a.t.localeCompare(b.t,'pt-BR'));
const litrosFmt = n => Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:0}) + ' L';

async function pageAcerto(){
  const A = S.sub.acerto = S.sub.acerto || { vis:'posto', incluirQuitados:false };

  const { data, error } = await sb.from('acerto_movimentos').select('*').order('data',{ascending:false});
  if (error){ $('#view').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  const todos = data || [];
  const mov = A.incluirQuitados ? todos : todos.filter(m=>m.status!=='quitado');

  const abertos = todos.filter(m=>m.status!=='quitado');
  const sinal = m => m.direcao==='saiu' ? 1 : -1;          // + = o posto deve ao Garra
  const saldoDe = arr => arr.reduce((a,m)=> a + sinal(m)*Number(m.valor||0), 0);

  const saiu   = sum(abertos.filter(m=>m.direcao==='saiu'));
  const entrou = sum(abertos.filter(m=>m.direcao==='entrou'));
  const saldo  = saiu - entrou;

  const litrosAberto = sum(abertos.filter(m=>m.tipo==='combustivel'),'litros');
  const semPreco = abertos.filter(m=>m.tipo==='combustivel' && !Number(m.valor_litro));
  const litrosSemPreco = sum(semPreco,'litros');

  const ids = [...new Set(abertos.map(m=>m.posto_id))];
  const porPosto = ids.map(id => {
    const meus = abertos.filter(m=>m.posto_id===id);
    return { id, nome: nomePosto(id),
      dinSaiu:  sum(meus.filter(m=>m.tipo==='dinheiro' && m.direcao==='saiu')),
      dinEnt:   sum(meus.filter(m=>m.tipo==='dinheiro' && m.direcao==='entrou')),
      litros:   sum(meus.filter(m=>m.tipo==='combustivel'),'litros'),
      combVal:  sum(meus.filter(m=>m.tipo==='combustivel')),
      semPreco: meus.some(m=>m.tipo==='combustivel' && !Number(m.valor_litro)),
      saldo:    saldoDe(meus) };
  }).sort((a,b)=> b.saldo - a.saldo);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Saiu do Garra', money(saiu), 'Dinheiro e combustível devolvido', PAL[1])}
      ${tile('Entrou no Garra', money(entrou), 'Dinheiro recebido e combustível emprestado', PAL[2])}
      ${tile(saldo >= 0 ? 'Os postos devem ao Garra' : 'O Garra deve aos postos',
        money(Math.abs(saldo)), 'Saldo de tudo que está em aberto', saldo>=0?PAL[2]:PAL[1])}
      ${tile('Combustível a devolver', litrosFmt(litrosAberto),
        `${abertos.filter(m=>m.tipo==='combustivel').length} empréstimo(s) em aberto`, PAL[3])}
    </div>

    ${litrosSemPreco > 0 ? `<div class="msg info" style="margin-bottom:16px">
      <b>${litrosFmt(litrosSemPreco)}</b> de combustível ainda estão <b>sem valor por litro</b>, então entram
      no saldo como zero. Abra cada empréstimo e preencha o preço para o saldo em reais ficar completo.
    </div>`:''}

    ${porPosto.length ? `<div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Saldo por posto', sub:'Positivo: o posto deve ao Garra', canvas:'chAcSaldo',
        legend: legendHTML(porPosto.slice(0,6).map((p,i)=>({c:p.saldo>=0?PAL[2]:PAL[1], t:p.nome, v:p.saldo}))),
        table: miniTable([{t:'Posto'},{t:'Saldo',num:1}],
          porPosto.map(p=>[esc(p.nome), `<span class="${p.saldo>=0?'pos':'neg'}">${money(p.saldo)}</span>`]),
          ['Total', money(saldo)]) })}
      ${vizCard({ title:'Combustível em aberto', sub:'Litros por posto', canvas:'chAcLit',
        legend: legendHTML(porPosto.filter(p=>p.litros>0).map((p,i)=>({c:PAL[i%8], t:p.nome, v:p.litros}))),
        table: miniTable([{t:'Posto'},{t:'Litros',num:1},{t:'Valorizado',num:1}],
          porPosto.filter(p=>p.litros>0).map(p=>[esc(p.nome), litrosFmt(p.litros),
            p.semPreco?'<span style="color:var(--warning)">falta preço</span>':money(p.combVal)]),
          ['Total', litrosFmt(litrosAberto), '']) })}
    </div>`:''}

    <div class="sub-tabs">
      <button data-v="posto" class="${A.vis==='posto'?'on':''}">Por posto</button>
      <button data-v="mov"   class="${A.vis==='mov'?'on':''}">Movimentações</button>
    </div>

    ${toolbar(`<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--text-secondary);cursor:pointer">
        <input type="checkbox" id="cbQuit" ${A.incluirQuitados?'checked':''}> mostrar quitados</label>
      ${btnNovo('Nova movimentação','new')}`)}

    <div class="tablecard"><div class="tablescroll"><table>
    ${A.vis==='posto' ? `
      <thead><tr><th>Posto</th><th class="num">Dinheiro que saiu</th><th class="num">Dinheiro que voltou</th>
        <th class="num">Combustível</th><th class="num">Saldo</th><th>Situação</th></tr></thead>
      <tbody id="tbody">${porPosto.length ? porPosto.map(p=>`
        <tr data-s="${esc(p.nome.toLowerCase())}">
          <td><b style="font-weight:600">${esc(p.nome)}</b></td>
          <td class="num">${p.dinSaiu?money(p.dinSaiu):'—'}</td>
          <td class="num">${p.dinEnt?money(p.dinEnt):'—'}</td>
          <td class="num">${p.litros?`${litrosFmt(p.litros)}${p.semPreco?'':`<div style="font-size:11.5px;color:var(--text-muted)">${money(p.combVal)}</div>`}`:'—'}</td>
          <td class="num"><b class="${p.saldo>=0?'pos':'neg'}">${money(p.saldo)}</b></td>
          <td><span class="pill"><i style="background:${p.saldo>=0?'var(--good)':'var(--critical)'}"></i>${p.saldo>=0?'deve ao Garra':'o Garra deve'}</span></td>
        </tr>`).join('') : emptyRow(6,'Nenhuma movimentação em aberto.')}</tbody>
      ${porPosto.length?`<tfoot><tr><td>Total</td>
        <td class="num">${money(sum(abertos.filter(m=>m.tipo==='dinheiro'&&m.direcao==='saiu')))}</td>
        <td class="num">${money(sum(abertos.filter(m=>m.tipo==='dinheiro'&&m.direcao==='entrou')))}</td>
        <td class="num">${litrosFmt(litrosAberto)}</td>
        <td class="num"><b class="${saldo>=0?'pos':'neg'}">${money(saldo)}</b></td><td></td></tr></tfoot>`:''}
    ` : `
      <thead><tr><th>Data</th><th>Deve para / de</th><th>Tipo</th><th>Descrição</th>
        <th class="num">Volume</th><th class="num">R$/L</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody id="tbody">${mov.length ? mov.map(m=>`
        <tr data-s="${esc((nomePosto(m.posto_id)+' '+(m.descricao||'')+' '+(PRODUTO[m.produto]||'')+' '+brDate(m.data)).toLowerCase())}"
            style="${m.status==='quitado'?'opacity:.5':''}">
          <td>${brDate(m.data)}</td>
          <td><b style="font-weight:600">${esc(nomePosto(m.posto_id))}</b>
            <div style="font-size:11.5px;color:var(--text-muted)">${m.direcao==='saiu'?'saiu do Garra':'entrou no Garra'}</div></td>
          <td><span class="pill"><i style="background:${m.tipo==='combustivel'?(PROD_COR[m.produto]||PAL[3]):PAL[6]}"></i>${m.tipo==='combustivel'?esc(PRODUTO[m.produto]||'Combustível'):'Dinheiro'}</span></td>
          <td style="font-size:12.5px">${esc(m.descricao||'—')}${m.documento?`<div style="font-size:11.5px;color:var(--text-muted)">nota ${esc(m.documento)}</div>`:''}${m.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(m.observacoes)}</div>`:''}</td>
          <td class="num">${m.litros?litrosFmt(m.litros):'—'}</td>
          <td class="num">${Number(m.valor_litro)?NUM.format(m.valor_litro):(m.tipo==='combustivel'?'<span style="color:var(--warning)">falta</span>':'—')}</td>
          <td class="num"><b class="${m.direcao==='saiu'?'pos':'neg'}">${m.direcao==='saiu'?'+':'−'} ${money(m.valor)}</b></td>
          <td><span class="pill"><i style="background:${m.status==='quitado'?'var(--good)':'var(--warning)'}"></i>${m.status==='quitado'?'Quitado':'Em aberto'}</span></td>
          <td>${acts(m.id)}</td>
        </tr>`).join('') : emptyRow(9,'Nenhuma movimentação registrada.')}</tbody>
    `}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  $$('.sub-tabs button').forEach(b=>b.addEventListener('click',()=>{ A.vis = b.dataset.v; render(); }));
  $('#cbQuit')?.addEventListener('change', e=>{ A.incluirQuitados = e.target.checked; render(); });
  bindCrud('acerto_movimentos', todos, formAcerto);

  if (porPosto.length) S.charts.acSaldo = new Chart($('#chAcSaldo'), {
    type:'bar',
    data:{ labels: porPosto.map(p=>p.nome), datasets:[{ data: porPosto.map(p=>p.saldo),
      backgroundColor: porPosto.map(p=>p.saldo>=0?PAL[2]:PAL[1]), borderColor:INK.surface,
      borderWidth:1, borderRadius:4, maxBarThickness:26 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false}, tooltip:tooltipCfg},
      scales:{ x:{...axisMoney}, y:axisCat } }
  });

  const cl = porPosto.filter(p=>p.litros>0);
  if (cl.length) S.charts.acLit = new Chart($('#chAcLit'), {
    type:'bar',
    data:{ labels: cl.map(p=>p.nome), datasets:[{ data: cl.map(p=>p.litros),
      backgroundColor: cl.map((_,i)=>PAL[i%8]), borderColor:INK.surface, borderWidth:1,
      borderRadius:4, maxBarThickness:26 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${litrosFmt(c.parsed.x)}`}}},
      scales:{ x:{...axisCat, beginAtZero:true, ticks:{callback:v=>(v/1000)+' mil L'}}, y:axisCat } }
  });
}

function formAcerto(r={}){
  const ehComb = (r.tipo || 'combustivel') === 'combustivel';
  openModal({
    title: r.id ? 'Editar movimentação' : 'Nova movimentação',
    sub: 'Acerto entre o Garra e um posto do grupo',
    wide: true,
    body: `<div class="frow">
      ${fld('Centro de custo', inp('centro_custo','text', r.centro_custo||'Garra'))}
      ${fld('Data', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Tipo de movimentação', sel('tipo', [{v:'combustivel',t:'Combustível'},{v:'dinheiro',t:'Dinheiro'}], r.tipo||'combustivel'))}
      ${fld('Direção', sel('direcao', [
          {v:'entrou',t:'Entrou no Garra — o Garra fica devendo'},
          {v:'saiu',  t:'Saiu do Garra — o posto fica devendo'}], r.direcao||'entrou'), 'full')}
      ${fld('Deve para / de qual posto', sel('posto_id', optPostos(), r.posto_id), 'full')}
      ${fld('Número da nota', inp('documento','text', r.documento, 'placeholder="ex.: 12345"'))}
      ${fld('Descrição', inp('descricao','text', r.descricao))}

      <div class="field full" id="boxComb" style="${ehComb?'':'display:none'}">
        <div class="frow" style="margin:0">
          ${fld('Produto', sel('produto', opts(PRODUTO), r.produto||'gasolina_comum'))}
          ${fld('Volume (litros)', inp('litros','text', r.litros!=null?NUM.format(r.litros):'', 'data-money="1" inputmode="decimal" placeholder="5.000"'))}
          ${fld('Valor da nota (R$)', inp('valor_nota','text', (ehComb && r.valor!=null && Number(r.valor)>0)?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
          ${fld('Valor por litro (R$)', inp('valor_litro','text', r.valor_litro!=null?Number(r.valor_litro).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4}):'', 'inputmode="decimal" placeholder="5,89"'))}
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:5px">
          Preencha o volume e <b>um dos dois</b>: o valor da nota ou o preço por litro. O outro se completa sozinho.
        </div>
      </div>

      <div class="field" id="boxDin" style="${ehComb?'display:none':''}">
        <label>Valor (R$)</label>
        <input name="valor" type="text" data-money="1" inputmode="decimal" placeholder="0,00"
               value="${r.valor!=null && !ehComb ? NUM.format(r.valor) : ''}">
      </div>

      ${fld('Situação', sel('status', [{v:'aberto',t:'Em aberto'},{v:'quitado',t:'Quitado'}], r.status||'aberto'))}
      ${fld('Data da quitação', inp('data_quitacao','date', r.data_quitacao||''))}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => {
      const q = n => m.querySelector(`[name="${n}"]`);
      const selTipo = q('tipo'), boxC = $('#boxComb', m), boxD = $('#boxDin', m);
      const elL = q('litros'), elN = q('valor_nota'), elP = q('valor_litro');
      let mexendo = false;                    // evita os dois campos brigarem entre si

      const escreve = (el, v, casas=2) => {
        mexendo = true;
        el.value = v > 0 ? v.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:casas}) : '';
        mexendo = false;
      };
      // digitou o preco -> completa a nota
      const doPreco = () => {
        if (mexendo) return;
        const l = parseMoney(elL.value), p = parseMoney(elP.value);
        if (l > 0 && p > 0) escreve(elN, l * p);
      };
      // digitou a nota -> completa o preco
      const doNota = () => {
        if (mexendo) return;
        const l = parseMoney(elL.value), n = parseMoney(elN.value);
        if (l > 0 && n > 0) escreve(elP, n / l, 4);
      };
      // mudou o volume -> recalcula a partir do que ja estiver preenchido
      const doLitros = () => {
        if (mexendo) return;
        const l = parseMoney(elL.value);
        if (l <= 0) return;
        if (parseMoney(elP.value) > 0) escreve(elN, l * parseMoney(elP.value));
        else if (parseMoney(elN.value) > 0) escreve(elP, parseMoney(elN.value) / l, 4);
      };

      ['input','change','blur'].forEach(ev => {
        elP.addEventListener(ev, doPreco);
        elN.addEventListener(ev, doNota);
        elL.addEventListener(ev, doLitros);
      });

      const trocaTipo = () => {
        const comb = selTipo.value === 'combustivel';
        boxC.style.display = comb ? '' : 'none';
        boxD.style.display = comb ? 'none' : '';
      };
      selTipo.addEventListener('change', trocaTipo);

      $('#sv',m).addEventListener('click', async ()=>{
        const d = formData(m);
        delete d.valor_nota;
        if (!d.posto_id) return toast('Escolha o posto.', true);
        if (d.tipo === 'combustivel') {
          d.litros = parseMoney(elL.value);
          if (!d.litros) return toast('Informe o volume em litros.', true);
          const p = parseMoney(elP.value), n = parseMoney(elN.value);
          if (!p && !n) return toast('Informe o valor da nota ou o preço por litro.', true);
          d.valor_litro = p > 0 ? p : null;      // o banco completa o que faltar
          d.valor       = p > 0 ? 0 : n;
        } else {
          if (!d.valor) return toast('Informe o valor.', true);
          d.produto = null; d.litros = null; d.valor_litro = null;
        }
        if (await save('acerto_movimentos', d, r.id)) { closeModal(); render(); }
      });
    }
  });
}

/* ============================================================
   CRÉDITOS — o que terceiros devem ao Garra
   Não é cliente e não é receita: é direito a receber. O caso principal
   é o antigo proprietário, pelas rescisões que o Garra pagou por ele.
   ============================================================ */
const ORIGEM_CRED = { rescisao:'Rescisão', emprestimo:'Empréstimo',
  adiantamento:'Adiantamento', reembolso:'Reembolso', outro:'Outro' };

async function pageCreditos(){
  const K = S.sub.cred = S.sub.cred || { vis:'devedor', incluirRecebidos:false };

  const { data, error } = await sb.from('creditos').select('*').order('data',{ascending:false});
  if (error){ $('#view').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  const todos = data || [];
  const rows = K.incluirRecebidos ? todos : todos.filter(c=>c.status!=='recebido');

  const total     = sum(todos);
  const recebido  = sum(todos,'valor_recebido');
  const aberto    = total - recebido;

  const devedores = [...new Set(todos.map(c=>c.devedor))].map(d => {
    const meus = todos.filter(c=>c.devedor===d);
    return { d, n: meus.length, total: sum(meus), rec: sum(meus,'valor_recebido'),
             ab: sum(meus) - sum(meus,'valor_recebido'),
             antiga: meus.map(c=>c.data).sort()[0] };
  }).sort((a,b)=>b.ab-a.ab);

  const porOrigem = [...groupSum(todos, c=>ORIGEM_CRED[c.origem]||c.origem)].sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Total a receber', money(aberto), `${todos.filter(c=>c.status!=='recebido').length} item(ns) em aberto`, PAL[2])}
      ${tile('Já recebido', money(recebido), total?`${pct(recebido,total)} do total`:'', PAL[0])}
      ${tile('Crédito total', money(total), `${todos.length} lançamento${todos.length===1?'':'s'}`, PAL[6])}
      ${devedores[0] ? tile('Maior devedor', money(devedores[0].ab),
        `${esc(devedores[0].d)} · desde ${brDate(devedores[0].antiga)}`, PAL[3]) : ''}
    </div>

    ${todos.length ? `<div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Quem deve ao Garra', sub:'Saldo em aberto por devedor', canvas:'chCrDev',
        legend: legendHTML(devedores.map((x,i)=>({c:PAL[i%8], t:x.d, v:x.ab}))),
        table: miniTable([{t:'Devedor'},{t:'Itens',num:1},{t:'Recebido',num:1},{t:'Em aberto',num:1}],
          devedores.map(x=>[esc(x.d), String(x.n), x.rec?money(x.rec):'—', money(x.ab)]),
          ['Total', String(todos.length), money(recebido), money(aberto)]) })}
      ${vizCard({ title:'Por origem', sub:'De onde vem o crédito', canvas:'chCrOri',
        legend: legendHTML(porOrigem.map((o,i)=>({c:PAL[i%8], t:o[0], v:o[1]}))),
        table: miniTable([{t:'Origem'},{t:'Valor',num:1},{t:'%',num:1}],
          porOrigem.map(o=>[esc(o[0]), money(o[1]), pct(o[1],total)]),
          ['Total', money(total), '100%']) })}
    </div>`:''}

    ${toolbar(`<label style="display:flex;gap:7px;align-items:center;font-size:12.5px;color:var(--text-secondary);cursor:pointer">
        <input type="checkbox" id="cbRec" ${K.incluirRecebidos?'checked':''}> mostrar já recebidos</label>
      ${btnNovo('Novo crédito','new')}`)}

    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Data</th><th>Devedor</th><th>Origem</th><th>Descrição</th>
        <th class="num">Principal</th><th class="num">Encargos</th><th class="num">Valor</th>
        <th class="num">Recebido</th><th class="num">Em aberto</th><th>Situação</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(c=>`
        <tr data-s="${esc(((c.devedor||'')+' '+(c.descricao||'')+' '+(c.referencia||'')).toLowerCase())}"
            style="${c.status==='recebido'?'opacity:.5':''}">
          <td>${brDate(c.data)}</td>
          <td><b style="font-weight:600">${esc(c.devedor)}</b></td>
          <td><span class="pill"><i style="background:${PAL[Object.keys(ORIGEM_CRED).indexOf(c.origem)%8]}"></i>${esc(ORIGEM_CRED[c.origem]||c.origem)}</span></td>
          <td style="font-size:12.5px">${esc(c.descricao||'—')}${c.referencia?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(c.referencia)}</div>`:''}
            ${c.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(c.observacoes)}</div>`:''}</td>
          <td class="num">${c.valor_base!=null?money(c.valor_base):'—'}</td>
          <td class="num">${c.valor_encargos!=null?money(c.valor_encargos):'—'}</td>
          <td class="num"><b>${money(c.valor)}</b></td>
          <td class="num">${Number(c.valor_recebido)>0?money(c.valor_recebido):'—'}</td>
          <td class="num"><b>${money(Number(c.valor)-Number(c.valor_recebido))}</b></td>
          <td><span class="pill"><i style="background:${c.status==='recebido'?'var(--good)':c.status==='parcial'?'var(--warning)':'var(--critical)'}"></i>${c.status==='recebido'?'Recebido':c.status==='parcial'?'Parcial':'Em aberto'}</span></td>
          <td>${acts(c.id)}</td>
        </tr>`).join('') : emptyRow(11,'Nenhum crédito registrado.')}</tbody>
      ${rows.length?`<tfoot><tr><td colspan="6">Total</td>
        <td class="num">${money(sum(rows))}</td>
        <td class="num">${money(sum(rows,'valor_recebido'))}</td>
        <td class="num"><b>${money(sum(rows)-sum(rows,'valor_recebido'))}</b></td>
        <td colspan="2"></td></tr></tfoot>`:''}
    </table></div></div>`;

  bindVizToggles(); wireSearch();
  $('#cbRec')?.addEventListener('change', e=>{ K.incluirRecebidos = e.target.checked; render(); });
  bindCrud('creditos', todos, formCredito);

  if (devedores.length) S.charts.crDev = new Chart($('#chCrDev'), {
    type:'bar',
    data:{ labels: devedores.map(x=>x.d), datasets:[{ data: devedores.map(x=>x.ab),
      backgroundColor: devedores.map((_,i)=>PAL[i%8]), borderColor:INK.surface, borderWidth:1,
      borderRadius:4, maxBarThickness:28 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false}, tooltip:tooltipCfg},
      scales:{ x:{...axisMoney, beginAtZero:true}, y:axisCat } }
  });
  if (porOrigem.length) S.charts.crOri = new Chart($('#chCrOri'), {
    type:'doughnut',
    data:{ labels: porOrigem.map(o=>o[0]), datasets:[{ data: porOrigem.map(o=>o[1]),
      backgroundColor: porOrigem.map((_,i)=>PAL[i%8]), borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,total)})`}}} }
  });
}

function formCredito(r={}){
  openModal({
    title: r.id ? 'Editar crédito' : 'Novo crédito',
    sub: 'Valor que alguém deve ao Garra',
    wide: true,
    body: `<div class="frow">
      ${fld('Data', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Devedor', inp('devedor','text', r.devedor||'Antigo proprietário'))}
      ${fld('Origem', sel('origem', opts(ORIGEM_CRED), r.origem||'rescisao'))}
      ${fld('Descrição', inp('descricao','text', r.descricao), 'full')}
      ${fld('Referência', inp('referencia','text', r.referencia, 'placeholder="cargo, documento, contrato..."'))}
      ${fld('Principal (R$)', inp('valor_base','text', r.valor_base!=null?NUM.format(r.valor_base):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Encargos (R$)', inp('valor_encargos','text', r.valor_encargos!=null?NUM.format(r.valor_encargos):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Valor total (R$)', inp('valor','text', r.valor!=null?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Já recebido (R$)', inp('valor_recebido','text', r.valor_recebido!=null?NUM.format(r.valor_recebido):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Data do recebimento', inp('data_recebimento','date', r.data_recebimento||''))}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => {
      // principal + encargos preenche o total sozinho, se ele ainda estiver vazio
      const b = m.querySelector('[name="valor_base"]'), e = m.querySelector('[name="valor_encargos"]'),
            t = m.querySelector('[name="valor"]');
      const soma = () => {
        const v = (parseMoney(b.value)||0) + (parseMoney(e.value)||0);
        if (v && (!t.value.trim() || t.dataset.auto)) { t.value = NUM.format(v); t.dataset.auto = '1'; }
      };
      [b,e].forEach(el=>el.addEventListener('blur', soma));
      t.addEventListener('input', ()=>{ delete t.dataset.auto; });

      $('#sv',m).addEventListener('click', async ()=>{
        const d = formData(m);
        if (!d.devedor) return toast('Informe o devedor.', true);
        if (!d.valor)   return toast('Informe o valor.', true);
        d.valor_recebido = d.valor_recebido || 0;
        if (await save('creditos', d, r.id)) { closeModal(); render(); }
      });
    }
  });
}

/* ============================================================
   CONCILIAÇÃO BANCÁRIA
   ============================================================ */
const NATUREZA = {
  venda_pix:'PIX de venda', venda_cartao:'Cartão', venda_dinheiro:'Dinheiro / depósito',
  transferencia:'Transferência', pagamento:'Pagamento / saída', tarifa:'Tarifa',
  estorno:'Estorno', aplicacao:'Aplicação financeira', outro:'Não classificado'
};
const NAT_COR = {
  venda_pix:PAL[2], venda_cartao:PAL[0], venda_dinheiro:PAL[5],
  transferencia:PAL[6], pagamento:PAL[1], tarifa:PAL[3], estorno:PAL[7],
  aplicacao:PAL[8]||PAL[3], outro:PAL[4]
};

async function pageConciliacao(){
  if (!S.contas.length){
    $('#view').innerHTML = `${roNote()}
      <div class="card"><div class="card-b">
        <div class="empty">${svg(I.inbox,38)}
          <p>Nenhuma conta bancária cadastrada ainda.<br>
             Cadastre a conta do posto para começar a importar o extrato.</p>
          ${S.admin?`<button class="btn" data-act="conta" style="margin-top:12px">${svg(I.plus,15)} Cadastrar conta bancária</button>`:''}
        </div>
      </div></div>`;
    $$('[data-act="conta"]').forEach(b=>b.addEventListener('click',()=>formConta()));
    return;
  }

  const C = S.sub.conc = S.sub.conc || {};
  if (!C.conta || !S.contas.some(c=>c.id===C.conta)) C.conta = S.contas[0].id;
  if (C.consolidar === undefined) C.consolidar = true;
  C.aberto = C.aberto || {};

  const { data, error } = await sb.rpc('extrato_conciliacao', {
    p_conta: C.conta,
    p_ini: S.from || '1900-01-01',
    p_fim: S.to   || '2999-12-31',
    p_consolidar: !!C.consolidar
  });
  if (error){ $('#view').innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
  const rows = data || [];

  // Aplicacao automatica (BB Rende Facil) e dinheiro indo e voltando da propria
  // conta — nao e entrada nem saida de verdade. Fica de fora dos totais e
  // aparece separado, senao infla os dois lados.
  const aplic    = rows.filter(r=>r.natureza==='aplicacao');
  const caixa    = rows.filter(r=>r.natureza!=='aplicacao');
  const entradas = caixa.filter(r=>r.tipo==='credito');
  const saidas   = caixa.filter(r=>r.tipo==='debito');
  const tEnt = sum(entradas), tSai = sum(saidas);
  const tAplIn  = sum(aplic.filter(r=>r.tipo==='credito'));   // resgatado
  const tAplOut = sum(aplic.filter(r=>r.tipo==='debito'));    // aplicado
  const nLanc = rows.reduce((a,r)=>a+(r.qtde||1),0);
  const conc  = rows.filter(r=>r.conciliado).length;
  const agrupadas = rows.filter(r=>r.agrupado);
  const compactadas = agrupadas.reduce((a,r)=>a+r.qtde,0) - agrupadas.length;

  const porNat = [...new Map(rows.map(r=>[r.natureza,0])).keys()]
    .map(n => ({ n, v: sum(rows.filter(r=>r.natureza===n)), q: rows.filter(r=>r.natureza===n).reduce((a,r)=>a+(r.qtde||1),0) }))
    .sort((a,b)=>b.v-a.v);

  const meses = monthsRange();

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Entradas no período', money(tEnt), `${entradas.reduce((a,r)=>a+(r.qtde||1),0)} lançamento(s)`, PAL[2])}
      ${tile('Saídas no período', money(tSai), `${saidas.length} lançamento(s)`, PAL[1])}
      ${tile('Resultado do caixa', money(tEnt-tSai), '', null, (tEnt-tSai)>=0?'pos':'neg')}
      ${tile('Conciliado', rows.length?`${conc}/${rows.length}`:'—', rows.length?pct(conc,rows.length)+' das linhas':'', 'var(--good)')}
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="min-width:210px">
        <label style="display:block;font-size:11.5px;font-weight:600;color:var(--text-muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em">Conta bancária</label>
        ${sel('conta', S.contas.map(c=>({v:c.id,t:c.apelido||`${c.banco} ${c.conta||''}`})), C.conta, 'id="selConta"')}
      </div>
      <div style="flex:1;min-width:260px">
        <label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer">
          <input type="checkbox" id="cbCons" ${C.consolidar?'checked':''} style="margin-top:2px;width:16px;height:16px;accent-color:var(--s1)">
          <span>
            <b style="font-size:13px">Agrupar recebimentos de venda por dia</b>
            <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px">
              PIX de cliente, cartão e depósito viram uma linha por dia. Transferências, repasses e
              qualquer saída continuam linha a linha.</span>
          </span>
        </label>
      </div>
      ${S.admin?`<button class="btn" data-act="imp">${svg(I.up,15)} Importar extrato</button>`:''}
    </div></div>

    ${aplic.length ? `<div class="msg info" style="margin-bottom:16px">
      <b>Aplicação automática:</b> saíram ${money(tAplOut)} da conta para a aplicação e voltaram
      ${money(tAplIn)} — líquido de <b>${money(Math.abs(tAplIn - tAplOut))}
      ${tAplIn >= tAplOut ? 'resgatado' : 'aplicado'}</b> em ${aplic.length} lançamento(s).
      Isso é dinheiro seu indo e voltando, então fica fora de entradas e saídas.
      O saldo da conta corrente não inclui o que está aplicado.
    </div>`:''}

    ${C.consolidar && compactadas>0 ? `<div class="msg info" style="margin-bottom:16px">
      <b>${compactadas.toLocaleString('pt-BR')}</b> lançamentos de venda estão agrupados em
      <b>${agrupadas.length}</b> linha(s) de resumo. Clique em qualquer linha de resumo para abrir o detalhe.
      Nada foi apagado — todos os lançamentos continuam gravados.
    </div>`:''}

    ${rows.length?`<div class="grid" style="margin-bottom:16px">
      ${vizCard({ title:'Entradas × Saídas por mês', sub:'Movimentação bancária importada', canvas:'chCoMes',
        legend: legendHTML([{c:PAL[2],t:'Entradas',v:tEnt},{c:PAL[1],t:'Saídas',v:tSai}]),
        table: miniTable([{t:'Mês'},{t:'Entradas',num:1},{t:'Saídas',num:1},{t:'Saldo',num:1}],
          meses.map(k=>{ const e=sum(entradas.filter(r=>monthKey(r.data)===k)), s=sum(saidas.filter(r=>monthKey(r.data)===k));
            return [monthLabelLong(k), money(e), money(s), `<span class="${e-s>=0?'pos':'neg'}">${money(e-s)}</span>`]; }),
          ['Total', money(tEnt), money(tSai), money(tEnt-tSai)]) })}
      ${vizCard({ title:'Composição do movimento', sub:'Por natureza do lançamento', canvas:'chCoNat',
        legend: legendHTML(porNat.map(x=>({c:NAT_COR[x.n]||PAL[4], t:NATUREZA[x.n]||x.n, v:x.v}))),
        table: miniTable([{t:'Natureza'},{t:'Lançamentos',num:1},{t:'Valor',num:1}],
          porNat.map(x=>[NATUREZA[x.n]||x.n, String(x.q), money(x.v)])) })}
    </div>`:''}

    ${toolbar(S.admin?`<button class="btn ghost" data-act="auto">${svg(I.link,15)} Sugerir vínculos</button>`:'')}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr><th>Data</th><th>Histórico</th><th>Natureza</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody id="tbody">${rows.length ? rows.map(r=>linhaConc(r,C)).join('') : emptyRow(6,'Nenhum extrato importado no período.')}</tbody>
    </table></div></div>`;

  bindVizToggles(); wireSearch();

  $('#selConta')?.addEventListener('change', e=>{ C.conta = e.target.value; C.aberto = {}; render(); });
  $('#cbCons')?.addEventListener('change', e=>{ C.consolidar = e.target.checked; render(); });
  $$('[data-act="imp"]').forEach(b=>b.addEventListener('click', importExtrato));
  $$('[data-act="auto"]').forEach(b=>b.addEventListener('click', ()=>sugerirVinculos(C.conta)));
  $$('[data-grp]').forEach(b=>b.addEventListener('click', ()=>abrirGrupo(b.dataset.grp, C)));
  $$('[data-det]').forEach(b=>b.addEventListener('click', ()=>detalheLancamento(b.dataset.det)));
  $$('[data-del]').forEach(b=>b.addEventListener('click', ()=>remove('extratos', b.dataset.del, 'lançamento')));
  $$('[data-tog]').forEach(b=>b.addEventListener('click', async ()=>{
    const { error } = await sb.from('extratos').update({conciliado: b.dataset.v!=='1'}).eq('id', b.dataset.tog);
    if (error) return toast(error.message, true);
    render();
  }));
  $$('[data-togg]').forEach(b=>b.addEventListener('click', async ()=>{
    const [ , d, nat ] = b.dataset.togg.split('|');
    const { error } = await sb.from('extratos').update({conciliado: b.dataset.v!=='1'})
      .eq('conta_id', C.conta).eq('data', d).eq('natureza', nat).eq('agrupavel', true);
    if (error) return toast(error.message, true);
    render();
  }));

  if (rows.length){
    S.charts.coMes = new Chart($('#chCoMes'), {
      type:'bar',
      data:{ labels:meses.map(monthLabel), datasets:[
        { label:'Entradas', data:meses.map(k=>sum(entradas.filter(r=>monthKey(r.data)===k))), backgroundColor:PAL[2],
          borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, borderColor:INK.surface, borderWidth:{left:1,right:1}, maxBarThickness:28 },
        { label:'Saídas', data:meses.map(k=>sum(saidas.filter(r=>monthKey(r.data)===k))), backgroundColor:PAL[1],
          borderRadius:{topLeft:4,topRight:4}, borderSkipped:false, borderColor:INK.surface, borderWidth:{left:1,right:1}, maxBarThickness:28 }
      ]},
      options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
        scales:{ x:axisCat, y:{...axisMoney, beginAtZero:true} } }
    });
    S.charts.coNat = new Chart($('#chCoNat'), {
      type:'doughnut', data:{ labels:porNat.map(x=>NATUREZA[x.n]||x.n),
        datasets:[{ data:porNat.map(x=>x.v), backgroundColor:porNat.map(x=>NAT_COR[x.n]||PAL[4]),
          borderColor:INK.surface, borderWidth:2 }]},
      options:{ cutout:'62%', plugins:{legend:{display:false}, tooltip:tooltipCfg} }
    });
  }
}

function linhaConc(r, C){
  const nat = `<span class="pill"><i style="background:${NAT_COR[r.natureza]||PAL[4]}"></i>${esc(NATUREZA[r.natureza]||r.natureza||'—')}</span>`;
  const busca = esc(((r.descricao||'')+' '+(NATUREZA[r.natureza]||'')+' '+brDate(r.data)).toLowerCase());

  if (r.agrupado){
    const aberto = !!C.aberto[r.linha_id];
    const det = aberto ? (C.det?.[r.linha_id] || null) : null;
    return `
      <tr data-s="${busca}" style="background:var(--page)">
        <td>${brDate(r.data)}</td>
        <td>
          <button class="linkbtn" data-grp="${esc(r.linha_id)}" style="background:none;border:0;padding:0;cursor:pointer;color:var(--s1);font:inherit;font-weight:600;text-align:left">
            ${aberto?'▾':'▸'} ${esc(r.descricao)}
          </button>
          <div style="font-size:11.5px;color:var(--text-muted)">${r.qtde.toLocaleString('pt-BR')} lançamentos agrupados</div>
        </td>
        <td>${nat}</td>
        <td class="num"><b class="pos">+ ${money(r.valor)}</b></td>
        <td><span class="pill"><i style="background:${r.conciliado?'var(--good)':'var(--warning)'}"></i>${r.conciliado?'Conciliado':'Pendente'}</span></td>
        <td>${S.admin?`<div class="rowacts">
          <button class="iconbtn" data-togg="g|${r.data}|${r.natureza}" data-v="${r.conciliado?1:0}" title="Conciliar o dia inteiro">${svg(I.link,15)}</button>
        </div>`:''}</td>
      </tr>
      ${aberto ? (det
        ? det.map(d=>`<tr data-s="${busca}"><td style="padding-left:26px;color:var(--text-muted);font-size:12px">${brDate(d.data)}</td>
            <td style="font-size:12.5px;color:var(--text-secondary)">${esc(d.descricao)}</td><td></td>
            <td class="num" style="font-size:12.5px">${money(d.valor)}</td><td></td><td></td></tr>`).join('')
        : `<tr><td colspan="6" style="color:var(--text-muted);font-size:12.5px">carregando detalhe...</td></tr>`) : ''}`;
  }

  const id = r.linha_id.slice(2);
  return `<tr data-s="${busca}">
    <td>${brDate(r.data)}</td>
    <td><button class="linkbtn" data-det="${id}" style="background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit;text-align:left;text-decoration:underline;text-decoration-color:var(--grid);text-underline-offset:3px">${esc(r.descricao)}</button></td>
    <td>${nat}</td>
    <td class="num"><b class="${r.tipo==='credito'?'pos':''}">${r.tipo==='credito'?'+':'−'} ${money(r.valor)}</b></td>
    <td><span class="pill"><i style="background:${r.conciliado?'var(--good)':'var(--warning)'}"></i>${r.conciliado?'Conciliado':'Pendente'}</span></td>
    <td>${S.admin?`<div class="rowacts">
      <button class="iconbtn" data-tog="${id}" data-v="${r.conciliado?1:0}" title="${r.conciliado?'Marcar como pendente':'Marcar como conciliado'}">${svg(I.link,15)}</button>
      <button class="iconbtn del" data-del="${id}" title="Excluir">${svg(I.trash,15)}</button></div>`:''}</td>
  </tr>`;
}

/* ------------------------------------------------------------------
   Detalhe de um lançamento do extrato.
   O banco manda historicos genericos ("PAGAMENTO FORNECEDOR",
   "Pagamento Eletr Boleto") sem dizer para quem foi. Aqui a gente
   procura no contas a pagar (e no contas a receber) titulos do mesmo
   valor por perto da data e mostra os candidatos para voce escolher.
   ------------------------------------------------------------------ */
async function detalheLancamento(id){
  const { data: e, error } = await sb.from('extratos').select('*').eq('id', id).single();
  if (error) return toast(error.message, true);

  const saida = e.tipo === 'debito';
  const dias  = d => { const x = new Date(e.data + 'T00:00:00'); x.setDate(x.getDate() + d);
    return x.toISOString().slice(0,10); };
  const v = Number(e.valor), tol = 0.01;

  const linha = (rot, val) => val ? `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--grid)">
      <span style="min-width:104px;color:var(--text-muted);font-size:12.5px">${rot}</span>
      <span style="font-size:13px">${val}</span></div>` : '';

  openModal({
    title: saida ? 'Saída do extrato' : 'Entrada do extrato',
    sub: brDate(e.data) + ' · ' + money(e.valor),
    wide: true,
    body: `
      ${linha('Histórico', esc(e.descricao||''))}
      ${linha('Documento', esc(e.documento||''))}
      ${linha('Natureza', esc(NATUREZA[e.natureza]||e.natureza||''))}
      ${linha('Situação', e.conciliado ? 'Conciliado' : 'Pendente')}
      <div id="cand" style="margin-top:16px">
        <div style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--text-secondary)">
          <span class="spin" style="border-color:var(--grid);border-top-color:var(--s1)"></span> procurando de quem é...</div>
      </div>`,
    footer: `<button class="btn ghost" data-close>Fechar</button>`,
    onMount: async m => {
      const box = $('#cand', m);

      // ja vinculado?
      if (e.despesa_id){
        const { data: d } = await sb.from('despesas').select('*').eq('id', e.despesa_id).single();
        if (d){
          box.innerHTML = `<div class="msg info"><b>Vinculado a:</b> ${esc(d.fornecedor||'sem fornecedor')} —
            ${esc(d.descricao||'')} · ${money(d.valor)}${d.erp_conta_nome?` · ${esc(d.erp_conta_nome)}`:''}
            ${S.admin?`<div style="margin-top:9px"><button class="btn ghost" id="unlink">Desvincular</button></div>`:''}</div>`;
          $('#unlink', m)?.addEventListener('click', async ()=>{
            const { error } = await sb.from('extratos').update({despesa_id:null, conciliado:false}).eq('id', id);
            if (error) return toast(error.message, true);
            closeModal(); toast('Vínculo removido.'); render();
          });
          return;
        }
      }

      const tabela = saida ? 'despesas' : 'contas_receber';
      const campo  = saida ? 'valor' : 'valor';
      const { data: cs, error: er } = await sb.from(tabela).select('*')
        .gte(campo, v - tol).lte(campo, v + tol)
        .gte('data', dias(-10)).lte('data', dias(10))
        .order('data', { ascending:true }).limit(30);

      if (er) { box.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; return; }

      if (!cs?.length){
        box.innerHTML = `<div class="msg">Não achei nenhum título de ${money(e.valor)} no
          ${saida?'contas a pagar':'contas a receber'} entre ${brDate(dias(-10))} e ${brDate(dias(10))}.
          ${saida?'Compras de combustível não entram no DRE, então pagamentos à distribuidora não aparecem aqui.':''}</div>`;
        return;
      }

      box.innerHTML = `
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:8px">
          ${cs.length} título(s) de ${money(e.valor)} por perto desta data${cs.length>1?' — escolha qual é':''}:</div>
        <div class="tablecard"><div class="tablescroll"><table><tbody>
          ${cs.map(c=>`<tr>
            <td style="white-space:nowrap;color:var(--text-muted);font-size:12.5px">${brDate(c.data)}</td>
            <td><b style="font-size:13px">${esc(saida ? (c.fornecedor||'—') : (c.cliente||'—'))}</b>
              <div style="font-size:12px;color:var(--text-muted)">${esc(c.descricao||c.historico||'')}
              ${c.erp_conta_nome?` · ${esc(c.erp_conta_nome)}`:''}${c.documento?` · doc ${esc(c.documento)}`:''}</div></td>
            <td class="num" style="white-space:nowrap">${money(saida?c.valor:c.valor)}</td>
            ${saida && S.admin ? `<td><button class="btn ghost" data-link="${c.id}" style="padding:5px 11px;font-size:12px">É este</button></td>` : '<td></td>'}
          </tr>`).join('')}
        </tbody></table></div></div>`;

      $$('[data-link]', m).forEach(b=>b.addEventListener('click', async ()=>{
        const { error } = await sb.from('extratos')
          .update({ despesa_id: b.dataset.link, conciliado: true }).eq('id', id);
        if (error) return toast(error.message, true);
        closeModal(); toast('Lançamento vinculado e conciliado.'); render();
      }));
    }
  });
}

async function abrirGrupo(linhaId, C){
  if (C.aberto[linhaId]){ delete C.aberto[linhaId]; return render(); }
  const [ , d, nat ] = linhaId.split(':');
  C.aberto[linhaId] = true; C.det = C.det || {};
  if (!C.det[linhaId]){
    const { data, error } = await sb.rpc('extrato_detalhe_grupo', { p_conta:C.conta, p_data:d, p_natureza:nat });
    if (error) return toast(error.message, true);
    C.det[linhaId] = data || [];
  }
  render();
}

async function sugerirVinculos(contaId){
  let q = sb.from('extratos').select('*').eq('conta_id', contaId).eq('conciliado', false).eq('tipo','debito');
  if (S.from) q = q.gte('data', S.from);
  if (S.to)   q = q.lte('data', S.to);
  const { data:pend, error } = await q;
  if (error) return toast(error.message, true);
  if (!pend?.length) return toast('Nenhuma saída pendente de conciliação.');
  const de = await periodo('despesas');
  let n = 0;
  for (const e of pend){
    const alvo = de.find(d => Math.abs(Number(d.valor)-Number(e.valor)) < 0.01 &&
      Math.abs(new Date(d.data) - new Date(e.data)) <= 5*86400000);
    if (alvo){
      await sb.from('extratos').update({conciliado:true, despesa_id:alvo.id}).eq('id', e.id);
      n++;
    }
  }
  toast(n ? `${n} lançamento${n===1?'':'s'} conciliado${n===1?'':'s'} automaticamente.` : 'Nenhuma correspondência encontrada.');
  if (n) render();
}

function importExtrato(){
  openModal({
    title:'Importar extrato bancário',
    sub:'Arquivo OFX (padrão dos bancos) ou CSV com data, histórico e valor',
    body:`
      <div class="frow" style="margin-bottom:16px">
        ${fld('Conta bancária', sel('conta_id', optContas(), S.sub.conc?.conta || S.contas[0]?.id || ''))}
      </div>
      <div class="drop-zone" id="dz">
        ${svg(I.up,32)}
        <b>Solte o arquivo aqui ou clique para escolher</b>
        <small>.ofx, .csv ou .txt exportado do internet banking<br>no iPhone, escolha em "No Meu iPhone" ou no app do banco</small>
        <input type="file" id="file" hidden>
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:var(--text-muted)">
        Todos os lançamentos são gravados individualmente. A classificação (venda, transferência,
        pagamento) é automática e pode ser ajustada em Cadastros › Regras do extrato.</p>
      <div id="st" style="margin-top:14px"></div>`,
    footer:`<button class="btn ghost" data-close>Cancelar</button>`,
    onMount: m => {
      const dz = $('#dz',m), f = $('#file',m);
      dz.addEventListener('click',()=>f.click());
      dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
      dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');
        if(e.dataTransfer.files[0]) lerExtrato(e.dataTransfer.files[0], m);});
      f.addEventListener('change',()=>{ if(f.files[0]) lerExtrato(f.files[0], m); });
    }
  });
}

function parseOFX(txt){
  const out = [];
  const blocks = txt.split(/<STMTTRN>/i).slice(1);
  blocks.forEach(b=>{
    const g = tag => (b.match(new RegExp(`<${tag}>([^<\r\n]*)`,'i'))||[])[1]?.trim();
    const dt = g('DTPOSTED'); if (!dt) return;
    const data = `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}`;
    // alguns bancos (Banco do Brasil, por exemplo) mandam todos os valores
    // positivos e indicam entrada/saida so no TRNTYPE. Por isso olhamos os dois.
    const v  = parseFloat((g('TRNAMT')||'0').replace(',', '.'));
    const tt = (g('TRNTYPE')||'').toUpperCase();
    const DEB = /^(DEBIT|PAYMENT|CHECK|FEE|SRVCHG|CASH|ATM|DIRECTDEBIT|REPEATPMT)$/;
    const CRE = /^(CREDIT|DEP|INT|DIV|DIRECTDEP)$/;
    const tipo = v < 0 ? 'debito'
               : DEB.test(tt) ? 'debito'
               : CRE.test(tt) ? 'credito'
               : 'credito';
    const desc = [g('MEMO'), g('NAME')].filter(Boolean).join(' — ') || 'Lançamento';
    out.push({ data, descricao: desc.slice(0,200), valor: Math.abs(v), tipo,
      documento: g('CHECKNUM')||g('FITID')||null, contraparte: g('NAME')||null });
  });
  return out;
}
function parseCSVExtrato(txt){
  const sep = (txt.split('\n')[0].match(/;/g)||[]).length > (txt.split('\n')[0].match(/,/g)||[]).length ? ';' : ',';
  const linhas = txt.split(/\r?\n/).filter(l=>l.trim());
  const out = [];
  linhas.forEach(l=>{
    const c = l.split(sep).map(x=>x.replace(/^"|"$/g,'').trim());
    const dm = (c[0]||'').match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/) || (c[0]||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dm) return;
    const data = dm[1].length===4 ? `${dm[1]}-${dm[2]}-${dm[3]}`
      : `${dm[3].length===2?'20'+dm[3]:dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
    let valor = null, desc = [];
    for (let i=1;i<c.length;i++){
      if (/^-?\(?\s*R?\$?\s*[\d.]+,\d{2}\)?$/.test(c[i]) || /^-?\d+\.\d{2}$/.test(c[i])) valor = parseMoney(c[i]);
      else if (c[i]) desc.push(c[i]);
    }
    if (valor === null) return;
    out.push({ data, descricao: desc.join(' — ').slice(0,200)||'Lançamento',
      valor: Math.abs(valor), tipo: valor < 0 ? 'debito' : 'credito' });
  });
  return out;
}

async function lerExtrato(file, m){
  const st = $('#st',m), conta_id = m.querySelector('[name="conta_id"]').value || null;
  st.innerHTML = `<div style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--text-secondary)"><span class="spin" style="border-color:var(--grid);border-top-color:var(--s1)"></span> Lendo ${esc(file.name)}...</div>`;
  const txt = await file.text();
  // "Saldo do dia" / "Saldo anterior" nao sao movimentacao, sao o saldo da conta.
  // Se entrarem como lancamento, o total do extrato fica duplicado.
  const SALDO = /^\s*s\.?\s*(a\s*l\s*d\s*o|aldo)\b|^\s*saldo\s+(do\s+dia|anterior|em|atual|bloq)/i;
  const itens = (/<STMTTRN>/i.test(txt) ? parseOFX(txt) : parseCSVExtrato(txt))
    .filter(i => !SALDO.test(i.descricao||''));
  if (!itens.length){ st.innerHTML = `<div class="msg err">Não encontrei lançamentos neste arquivo. Verifique se é um OFX ou um CSV com data, histórico e valor.</div>`; return; }

  const payload = itens.map(i=>({ ...i, conta_id, criado_por:S.user.id,
    hash: `${conta_id||'x'}|${i.data}|${i.valor}|${i.tipo}|${(i.documento||i.descricao||'').slice(0,60)}` }));

  // envia em blocos para aguentar extrato grande sem estourar a requisicao
  const LOTE = 500;
  let enviados = 0;
  for (let i=0;i<payload.length;i+=LOTE){
    st.innerHTML = `<div style="display:flex;gap:9px;align-items:center;font-size:13px;color:var(--text-secondary)">
      <span class="spin" style="border-color:var(--grid);border-top-color:var(--s1)"></span>
      Gravando ${Math.min(i+LOTE,payload.length).toLocaleString('pt-BR')} de ${payload.length.toLocaleString('pt-BR')} lançamentos...</div>`;
    const { error } = await sb.from('extratos')
      .upsert(payload.slice(i,i+LOTE), {onConflict:'hash', ignoreDuplicates:true});
    if (error){ st.innerHTML = `<div class="msg err">${esc(error.message)}</div>`; return; }
    enviados += Math.min(LOTE, payload.length-i);
  }
  if (S.sub.conc){ S.sub.conc.aberto = {}; S.sub.conc.det = {}; }
  toast(`${enviados.toLocaleString('pt-BR')} lançamento(s) processado(s). Duplicados foram ignorados.`);
  closeModal(); render();
}

/* ============================================================
   DOCUMENTOS
   ============================================================ */
async function pageDocumentos(){
  const rows = await periodo('documentos','*','competencia');
  const grupos = new Map();
  rows.forEach(r=>{ const k = monthKey(r.competencia); if(!grupos.has(k)) grupos.set(k,[]); grupos.get(k).push(r); });
  const kb = n => !n ? '—' : n>1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB';

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Arquivos no período', String(rows.length), `${grupos.size} mês/meses com documentos`)}
      ${Object.keys(TIPO_DOC).slice(0,3).map((t,i)=>tile(TIPO_DOC[t],
        String(rows.filter(r=>r.tipo===t).length), 'arquivo(s)', PAL[i])).join('')}
    </div>

    ${toolbar(btnNovo('Enviar documento','new'))}

    ${grupos.size ? [...grupos.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([k,docs])=>`
      <div class="card" style="margin-bottom:14px">
        <div class="card-h"><div style="flex:1"><h3>${monthLabelLong(k)}</h3><p>${docs.length} arquivo${docs.length===1?'':'s'}</p></div></div>
        <div class="card-b" style="padding-top:8px"><div class="tablescroll"><table>
          <thead><tr><th>Documento</th><th>Tipo</th><th>Enviado em</th><th class="num">Tamanho</th><th></th></tr></thead>
          <tbody>${docs.map(d=>`<tr>
            <td><b style="font-weight:600">${esc(d.titulo)}</b>
              ${d.observacoes?`<div style="font-size:11.5px;color:var(--text-muted)">${esc(d.observacoes)}</div>`:''}</td>
            <td><span class="pill">${esc(TIPO_DOC[d.tipo]||d.tipo)}</span></td>
            <td>${brDate(d.criado_em)}</td>
            <td class="num">${kb(d.tamanho)}</td>
            <td><div class="rowacts">
              <button class="iconbtn" data-dl="${d.arquivo_path}" title="Baixar">${svg(I.dl,15)}</button>
              ${S.admin?`<button class="iconbtn del" data-del="${d.id}" data-path="${esc(d.arquivo_path)}" title="Excluir">${svg(I.trash,15)}</button>`:''}
            </div></td></tr>`).join('')}</tbody>
        </table></div></div>
      </div>`).join('')
    : `<div class="tablecard"><div class="empty">${svg(I.doc,38)}<p>Nenhum documento no período selecionado.</p></div></div>`}`;

  wireSearch();
  $$('[data-act="new"]').forEach(b=>b.addEventListener('click', formDocumento));
  $$('[data-dl]').forEach(b=>b.addEventListener('click', async ()=>{
    const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.dl, 120);
    if (error) return toast(error.message, true);
    window.open(data.signedUrl, '_blank');
  }));
  $$('[data-del]').forEach(b=>b.addEventListener('click', async ()=>{
    if (!confirm('Excluir este documento?')) return;
    await sb.storage.from('documentos').remove([b.dataset.path]);
    const { error } = await sb.from('documentos').delete().eq('id', b.dataset.del);
    if (error) return toast(error.message, true);
    toast('Documento excluído.'); render();
  }));
}

function formDocumento(){
  const comp = iso(new Date(today().getFullYear(), today().getMonth(), 1));
  openModal({
    title:'Enviar documento',
    sub:'Extrato, relatório de vendas, despesas ou documentação obrigatória',
    body:`<div class="frow">
        ${fld('Competência (mês)', inp('competencia','date', comp, 'required'))}
        ${fld('Tipo', sel('tipo', opts(TIPO_DOC), 'extrato'))}
        ${fld('Título', inp('titulo','text','', 'placeholder="Deixe em branco para usar o nome do arquivo"'), 'full')}
        ${fld('Observações', txa('observacoes'), 'full')}
      </div>
      <div class="drop-zone" id="dz" style="margin-top:6px">
        ${svg(I.up,32)}<b>Solte o arquivo aqui ou clique para escolher</b>
        <small>PDF, imagem, planilha — até 50 MB</small>
        <input type="file" id="file" hidden>
      </div>
      <div id="fname" style="margin-top:10px;font-size:12.5px;color:var(--text-secondary)"></div>`,
    footer:`<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv" disabled>Enviar</button>`,
    onMount: m => {
      const dz=$('#dz',m), f=$('#file',m), sv=$('#sv',m);
      const pick = file => { f._file = file; $('#fname',m).innerHTML = `Selecionado: <b>${esc(file.name)}</b>`; sv.disabled=false; };
      dz.addEventListener('click',()=>f.click());
      dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
      dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
      dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over'); if(e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]);});
      f.addEventListener('change',()=>{ if(f.files[0]) pick(f.files[0]); });
      sv.addEventListener('click', async ()=>{
        sv.disabled=true; sv.innerHTML='<span class="spin"></span>';
        const d = formData(m);
        const doc = await uploadDocumento(f._file, {competencia:d.competencia, tipo:d.tipo,
          titulo:d.titulo||f._file.name, observacoes:d.observacoes});
        if (doc){ toast('Documento enviado.'); closeModal(); render(); }
        else { sv.disabled=false; sv.textContent='Enviar'; }
      });
    }
  });
}

/* ============================================================
   CADASTROS
   ============================================================ */
const CAD = [
  { id:'socios', nome:'Sócios' }, { id:'empresas', nome:'Empresas / centros de custo' },
  { id:'categorias', nome:'Categorias de despesa' }, { id:'contas_bancarias', nome:'Contas bancárias' },
  { id:'extrato_regras', nome:'Regras do extrato' }
];

async function pageCadastros(){
  const tab = S.sub.cad || 'socios';
  await loadCadastros();

  const body = {
    socios: () => ({
      cols:['Sócio','Participação','Cor','Situação'],
      rows: S.socios.map(r=>[
        `<b style="font-weight:600">${esc(r.nome)}</b>`,
        `${Number(r.percentual||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`,
        `<span class="pill"><i style="background:${esc(r.cor||PAL[0])}"></i>${esc(r.cor||'—')}</span>`,
        `<span class="pill"><i style="background:${r.ativo?'var(--good)':'var(--text-muted)'}"></i>${r.ativo?'Ativo':'Inativo'}</span>`
      ]).map((c,i)=>({c, id:S.socios[i].id})),
      form: formSocio
    }),
    empresas: () => ({
      cols:['Empresa','Grupo','CNPJ','Situação'],
      rows: S.empresas.map(r=>[
        `<b style="font-weight:600">${esc(r.nome)}</b>`, `<span class="pill">${esc(r.grupo)}</span>`,
        esc(r.cnpj||'—'),
        `<span class="pill"><i style="background:${r.ativo?'var(--good)':'var(--text-muted)'}"></i>${r.ativo?'Ativa':'Inativa'}</span>`
      ]).map((c,i)=>({c, id:S.empresas[i].id})),
      form: formEmpresa
    }),
    categorias: () => ({
      cols:['Categoria','Natureza','','Situação'],
      rows: S.categorias.map(r=>[
        `<b style="font-weight:600">${esc(r.nome)}</b>`, `<span class="pill">${esc(r.tipo)}</span>`, '',
        `<span class="pill"><i style="background:${r.ativo?'var(--good)':'var(--text-muted)'}"></i>${r.ativo?'Ativa':'Inativa'}</span>`
      ]).map((c,i)=>({c, id:S.categorias[i].id})),
      form: formCategoria
    }),
    contas_bancarias: () => ({
      cols:['Apelido','Banco','Agência / Conta','Situação'],
      rows: S.contas.map(r=>[
        `<b style="font-weight:600">${esc(r.apelido||r.banco)}</b>`, esc(r.banco),
        esc(`${r.agencia||'—'} / ${r.conta||'—'}`),
        `<span class="pill"><i style="background:${r.ativo?'var(--good)':'var(--text-muted)'}"></i>${r.ativo?'Ativa':'Inativa'}</span>`
      ]).map((c,i)=>({c, id:S.contas[i].id})),
      form: formConta
    }),
    extrato_regras: () => ({
      cols:['Ordem','Regra','Aplica em','Limite','Classifica como','Tratamento'],
      rows: S.regras.map(r=>[
        String(r.ordem),
        `<b style="font-weight:600">${esc(r.nome)}</b>${r.padrao?`<div style="font-size:11px;color:var(--text-muted);font-family:ui-monospace,monospace">${esc(r.padrao.slice(0,60))}</div>`:''}`,
        `<span class="pill">${r.aplica_em==='credito'?'Entradas':r.aplica_em==='debito'?'Saídas':'Todos'}</span>`,
        r.valor_max?`até ${money(r.valor_max)}`:(r.valor_min?`acima de ${money(r.valor_min)}`:'—'),
        `<span class="pill"><i style="background:${NAT_COR[r.natureza]||PAL[4]}"></i>${esc(NATUREZA[r.natureza]||r.natureza)}</span>`,
        r.agrupar
          ? `<span class="pill"><i style="background:${PAL[2]}"></i>Agrupa por dia</span>`
          : `<span class="pill"><i style="background:var(--text-muted)"></i>Linha a linha</span>`
      ]).map((c,i)=>({c, id:S.regras[i].id})),
      form: formRegra
    })
  }[tab]();

  $('#view').innerHTML = `
    ${roNote()}
    <div class="sub-tabs">${CAD.map(c=>`<button data-t="${c.id}" class="${c.id===tab?'on':''}">${esc(c.nome)}</button>`).join('')}</div>
    ${toolbar(btnNovo('Novo cadastro','new') + (tab==='extrato_regras'&&S.admin
      ? ` <button class="btn ghost" data-act="recl">${svg(I.link,15)} Reclassificar extrato</button>` : ''))}
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr>${body.cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th></th></tr></thead>
      <tbody id="tbody">${body.rows.length ? body.rows.map(r=>
        `<tr data-s="${esc(r.c.join(' ').replace(/<[^>]+>/g,'').toLowerCase())}">${r.c.map(c=>`<td>${c}</td>`).join('')}<td>${acts(r.id)}</td></tr>`
      ).join('') : emptyRow(body.cols.length+1,'Nenhum cadastro ainda.')}</tbody>
    </table></div></div>

    <div class="card" style="margin-top:16px"><div class="card-b">
      <b style="font-size:13.5px">Acessos do sistema</b>
      <p style="margin:4px 0 10px;font-size:12.5px;color:var(--text-muted)">Usuários com permissão de entrada no painel.</p>
      <div class="tablescroll"><table>
        <thead><tr><th>Usuário</th><th>Nome</th><th>Permissão</th></tr></thead>
        <tbody id="perfis"><tr><td colspan="3" style="color:var(--text-muted)">carregando...</td></tr></tbody>
      </table></div>
    </div></div>`;

  $$('.sub-tabs button').forEach(b=>b.addEventListener('click',()=>{ S.sub.cad = b.dataset.t; render(); }));
  wireSearch();
  const lista = {socios:S.socios, empresas:S.empresas, categorias:S.categorias,
                 contas_bancarias:S.contas, extrato_regras:S.regras}[tab];
  $$('[data-act="recl"]').forEach(b=>b.addEventListener('click', async ()=>{
    b.disabled = true;
    const { data, error } = await sb.rpc('reclassificar_extratos');
    b.disabled = false;
    if (error) return toast(error.message, true);
    toast(`${Number(data||0).toLocaleString('pt-BR')} lançamento(s) reclassificado(s) com as regras atuais.`);
    if (S.sub.conc){ S.sub.conc.aberto = {}; S.sub.conc.det = {}; }
  }));
  bindCrud(tab, lista, body.form);

  const { data:perfis } = await sb.from('perfis').select('*').order('papel');
  const pf = $('#perfis');
  if (pf) pf.innerHTML = (perfis||[]).map(p=>`<tr>
    <td><b style="font-weight:600">${esc(p.usuario)}</b></td><td>${esc(p.nome)}</td>
    <td><span class="pill"><i style="background:${p.papel==='admin'?'var(--s1)':'var(--text-muted)'}"></i>${p.papel==='admin'?'Administrador':'Somente leitura'}</span></td>
  </tr>`).join('');
}

const cadFooter = `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`;
function cadSave(table, m, id, prep){
  $('#sv',m).addEventListener('click', async ()=>{
    const d = formData(m); prep && prep(d);
    if (await save(table, d, id)) { closeModal(); render(); }
  });
}
function formSocio(r={}){
  openModal({ title: r.id?'Editar sócio':'Novo sócio', body:`<div class="frow">
      ${fld('Nome', inp('nome','text', r.nome, 'required'), 'full')}
      ${fld('Participação (%)', inp('percentual','text', r.percentual!=null?r.percentual:'50', 'inputmode="decimal"'))}
      ${fld('Cor no gráfico', inp('cor','color', r.cor||PAL[0]))}
      ${fld('Situação', sel('ativo',[{v:'true',t:'Ativo'},{v:'false',t:'Inativo'}], String(r.ativo!==false)), 'full')}
    </div>`, footer:cadFooter,
    onMount:m=>cadSave('socios', m, r.id, d=>{ d.percentual = parseMoney(d.percentual); d.ativo = d.ativo==='true'; })});
}
function formEmpresa(r={}){
  const grupos = [...new Set(S.empresas.map(e=>e.grupo).concat(['Grupo Parente','Grupo Felipe','Posto Garra']))];
  openModal({ title: r.id?'Editar empresa':'Nova empresa / centro de custo',
    sub:'Empresa que paga as despesas', body:`<div class="frow">
      ${fld('Nome da empresa', inp('nome','text', r.nome, 'required'), 'full')}
      ${fld('Grupo', `<input name="grupo" list="gl" value="${esc(r.grupo||'')}" placeholder="Grupo Parente"><datalist id="gl">${grupos.map(g=>`<option value="${esc(g)}">`).join('')}</datalist>`)}
      ${fld('CNPJ', inp('cnpj','text', r.cnpj))}
      ${fld('Situação', sel('ativo',[{v:'true',t:'Ativa'},{v:'false',t:'Inativa'}], String(r.ativo!==false)), 'full')}
    </div>`, footer:cadFooter,
    onMount:m=>cadSave('empresas', m, r.id, d=>{ d.ativo = d.ativo==='true'; d.grupo = d.grupo||'Grupo Parente'; })});
}
function formCategoria(r={}){
  openModal({ title: r.id?'Editar categoria':'Nova categoria de despesa', body:`<div class="frow">
      ${fld('Nome', inp('nome','text', r.nome, 'required'), 'full')}
      ${fld('Natureza', sel('tipo',[
        {v:'operacional',t:'Operacional'},{v:'administrativa',t:'Administrativa'},{v:'financeira',t:'Financeira'},
        {v:'investimento',t:'Investimento'},{v:'pessoal',t:'Pessoal / folha'},{v:'tributaria',t:'Tributária'},{v:'outros',t:'Outros'}
      ], r.tipo||'operacional'))}
      ${fld('Situação', sel('ativo',[{v:'true',t:'Ativa'},{v:'false',t:'Inativa'}], String(r.ativo!==false)))}
    </div>`, footer:cadFooter,
    onMount:m=>cadSave('categorias', m, r.id, d=>{ d.ativo = d.ativo==='true'; })});
}
function formConta(r={}){
  openModal({ title: r.id?'Editar conta':'Nova conta bancária', body:`<div class="frow">
      ${fld('Apelido', inp('apelido','text', r.apelido, 'placeholder="Ex.: Banco do Brasil — Posto"'), 'full')}
      ${fld('Banco', inp('banco','text', r.banco, 'required'))}
      ${fld('Agência', inp('agencia','text', r.agencia))}
      ${fld('Conta', inp('conta','text', r.conta))}
      ${fld('Situação', sel('ativo',[{v:'true',t:'Ativa'},{v:'false',t:'Inativa'}], String(r.ativo!==false)))}
    </div>`, footer:cadFooter,
    onMount:m=>cadSave('contas_bancarias', m, r.id, d=>{ d.ativo = d.ativo==='true'; })});
}

function formRegra(r={}){
  const nats = Object.entries(NATUREZA).map(([v,t])=>({v,t}));
  openModal({ title: r.id?'Editar regra do extrato':'Nova regra do extrato',
    sub:'As regras são avaliadas da menor para a maior ordem; vence a primeira que casar.',
    body:`<div class="frow">
      ${fld('Nome da regra', inp('nome','text', r.nome, 'required'), 'full')}
      ${fld('Ordem', inp('ordem','text', r.ordem!=null?r.ordem:'150', 'inputmode="numeric"'))}
      ${fld('Aplica em', sel('aplica_em',[{v:'ambos',t:'Todos os lançamentos'},{v:'credito',t:'Somente entradas'},{v:'debito',t:'Somente saídas'}], r.aplica_em||'credito'))}
      ${fld('Texto no histórico', inp('padrao','text', r.padrao, 'placeholder="pix|qr code — deixe vazio para qualquer histórico"'), 'full')}
      ${fld('Valor máximo', inp('valor_max','text', r.valor_max!=null?NUM.format(r.valor_max):'', 'data-money="1" inputmode="decimal" placeholder="opcional"'))}
      ${fld('Valor mínimo', inp('valor_min','text', r.valor_min!=null?NUM.format(r.valor_min):'', 'data-money="1" inputmode="decimal" placeholder="opcional"'))}
      ${fld('Classifica como', sel('natureza', nats, r.natureza||'venda_pix'))}
      ${fld('Tratamento na tela', sel('agrupar',[{v:'true',t:'Agrupar por dia (venda)'},{v:'false',t:'Mostrar linha a linha'}], String(!!r.agrupar)))}
      ${fld('Situação', sel('ativo',[{v:'true',t:'Ativa'},{v:'false',t:'Inativa'}], String(r.ativo!==false)))}
      ${fld('Observação', inp('observacao','text', r.observacao), 'full')}
    </div>
    <p style="margin:12px 0 0;font-size:12px;color:var(--text-muted)">
      Depois de salvar, use <b>Reclassificar extrato</b> para aplicar a mudança aos lançamentos já importados.</p>`,
    footer:cadFooter,
    onMount:m=>cadSave('extrato_regras', m, r.id, d=>{
      d.ordem = parseInt(d.ordem,10) || 150;
      d.agrupar = d.agrupar==='true'; d.ativo = d.ativo==='true';
      d.valor_max = d.valor_max ? parseMoney(d.valor_max) : null;
      d.valor_min = d.valor_min ? parseMoney(d.valor_min) : null;
      d.padrao = d.padrao || null; d.observacao = d.observacao || null;
    })});
}

/* ============================================================
   START
   ============================================================ */
sb.auth.getSession().then(({data:{session}}) => { if (session) boot(); else $('#login').style.display='grid'; });

