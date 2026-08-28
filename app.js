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
  socios:[], empresas:[], categorias:[], contas:[], regras:[],
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
  {sec:'Controle'},
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
  const [so,em,ca,co,rg] = await Promise.all([
    sb.from('socios').select('*').order('nome'),
    sb.from('empresas').select('*').order('grupo').order('nome'),
    sb.from('categorias').select('*').order('nome'),
    sb.from('contas_bancarias').select('*').order('banco'),
    sb.from('extrato_regras').select('*').order('ordem')
  ]);
  S.socios = so.data||[]; S.empresas = em.data||[]; S.categorias = ca.data||[]; S.contas = co.data||[];
  S.regras = rg.data||[];
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
      retiradas: pageRetiradas, despesas: pageDespesas, conciliacao: pageConciliacao,
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

const optSocios = () => S.socios.map(s=>({v:s.id,t:s.nome}));
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
const TIPO_RETIRADA = { pro_labore:'Pró-labore', lucro:'Distribuição de lucro', adiantamento:'Adiantamento', reembolso:'Reembolso', outro:'Outro' };
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

  const porSocio = S.socios.map(s => ({ s, v: sum(rows.filter(r=>r.socio_id===s.id)) }));
  const tipos = [...groupSum(rows, r=>TIPO_APORTE[r.tipo]||r.tipo)].sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Total aportado no período', money(total), `${rows.length} lançamento${rows.length===1?'':'s'}`)}
      ${porSocio.map((p,i)=>tile(`Sócio ${p.s.nome}`, money(p.v), total?`${pct(p.v,total)} do total`:'', p.s.cor||PAL[i])).join('')}
    </div>

    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Aportes por mês', sub:'Empilhado por sócio', canvas:'chApMes',
        legend: legendHTML(porSocio.map((p,i)=>({c:p.s.cor||PAL[i], t:p.s.nome, v:p.v}))),
        table: miniTable([{t:'Mês'}].concat(S.socios.map(s=>({t:s.nome,num:1}))).concat([{t:'Total',num:1}]),
          meses.map(k=>[monthLabelLong(k)].concat(S.socios.map(s=>
            money(sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))))).concat([
            money(sum(rows.filter(r=>monthKey(r.data)===k)))])),
          ['Total'].concat(porSocio.map(p=>money(p.v))).concat([money(total)])) })}
      ${vizCard({ title:'Por tipo de aporte', sub:'Dinheiro, carta de crédito, investimento', canvas:'chApTipo',
        legend: legendHTML(tipos.map((t,i)=>({c:PAL[i], t:t[0], v:t[1]}))),
        table: miniTable([{t:'Tipo'},{t:'Valor',num:1},{t:'%',num:1}],
          tipos.map(t=>[esc(t[0]), money(t[1]), pct(t[1],total)]), ['Total', money(total),'100%']) })}
    </div>

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
    data:{ labels: meses.map(monthLabel), datasets: S.socios.map((s,i)=>({
      label:s.nome, data: meses.map(k=>sum(rows.filter(r=>r.socio_id===s.id && monthKey(r.data)===k))),
      backgroundColor: s.cor||PAL[i], borderColor:INK.surface, borderWidth:2, borderRadius:4, maxBarThickness:30 }))},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      scales:{ x:{...axisCat, stacked:true}, y:{...axisMoney, stacked:true, beginAtZero:true} } }
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
      ${porSocio.map((p,i)=>tile(`Sócio ${p.s.nome}`, money(p.v),
        `Saldo (aporte − retirada) <b style="margin-left:3px" class="${p.a-p.v>=0?'pos':'neg'}">${moneyShort(p.a-p.v)}</b>`,
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
      <thead><tr><th>Data</th><th>Sócio</th><th>Natureza</th><th>Descrição</th><th>Empresa</th><th class="num">Valor</th><th></th></tr></thead>
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
      backgroundColor: s.cor||PAL[i], borderColor:INK.surface, borderWidth:2, borderRadius:4, maxBarThickness:30 }))},
    options:{ plugins:{legend:{display:false}, tooltip:tooltipCfg}, interaction:{mode:'index',intersect:false},
      scales:{ x:{...axisCat, stacked:true}, y:{...axisMoney, stacked:true, beginAtZero:true} } }
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
    sub: 'Valor retirado pelo sócio',
    body: `<div class="frow">
      ${fld('Data', inp('data','date', r.data||iso(today()), 'required'))}
      ${fld('Sócio', sel('socio_id', optSocios(), r.socio_id))}
      ${fld('Natureza', sel('tipo', opts(TIPO_RETIRADA), r.tipo||'pro_labore'))}
      ${fld('Valor (R$)', inp('valor','text', r.valor!=null?NUM.format(r.valor):'', 'data-money="1" inputmode="decimal" placeholder="0,00"'))}
      ${fld('Descrição', inp('descricao','text', r.descricao), 'full')}
      ${fld('Empresa pagadora', sel('empresa_id', optEmpresas(), r.empresa_id), 'full')}
      ${fld('Observações', txa('observacoes', r.observacoes), 'full')}
    </div>`,
    footer: `<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="sv">Salvar</button>`,
    onMount: m => $('#sv',m).addEventListener('click', async ()=>{
      const d = formData(m);
      if (!d.valor) return toast('Informe o valor.', true);
      if (await save('retiradas', d, r.id)) { closeModal(); render(); }
    })
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
  const catTop = cats.slice(0,5), catResto = cats.slice(5).reduce((a,b)=>a+b[1],0);
  const catL = catTop.map(c=>c[0]).concat(catResto>0?['Outros']:[]);
  const catV = catTop.map(c=>c[1]).concat(catResto>0?[catResto]:[]);

  const emps = [...groupSum(ativos, r=>nomeEmpresa(r.empresa_id))].sort((a,b)=>b[1]-a[1]).slice(0,8);
  const grupos = [...groupSum(ativos, r=>grupoEmpresa(r.empresa_id))].sort((a,b)=>b[1]-a[1]);

  $('#view').innerHTML = `
    ${roNote()}
    <div class="grid tiles" style="margin-bottom:16px">
      ${tile('Despesas do período', money(total), `${ativos.length} lançamento${ativos.length===1?'':'s'}`, PAL[1])}
      ${tile('Pago', money(pago), total?pct(pago,total)+' do total':'', 'var(--good)')}
      ${tile('A pagar', money(aPagar), total?pct(aPagar,total)+' do total':'', 'var(--warning)')}
      ${tile('Maior categoria', cats[0]?money(cats[0][1]):'—', cats[0]?esc(cats[0][0]):'')}
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      ${vizCard({ title:'Despesas por categoria', sub:'Participação no total do período', canvas:'chDeCat',
        legend: legendHTML(catL.map((l,i)=>({c:PAL[i], t:l, v:catV[i]}))),
        table: miniTable([{t:'Categoria'},{t:'Valor',num:1},{t:'%',num:1}],
          cats.map(c=>[esc(c[0]), money(c[1]), pct(c[1],total)]), ['Total', money(total),'100%']) })}
      ${vizCard({ title:'Por centro de custo', sub:'Empresa que pagou a despesa', canvas:'chDeEmp',
        legend: legendHTML(grupos.map((g,i)=>({c:PAL[0], t:g[0], v:g[1]}))),
        table: miniTable([{t:'Empresa'},{t:'Grupo'},{t:'Valor',num:1},{t:'%',num:1}],
          [...groupSum(ativos, r=>r.empresa_id||'null')].sort((a,b)=>b[1]-a[1]).map(([id,v])=>
            [esc(nomeEmpresa(id==='null'?null:id)), esc(grupoEmpresa(id==='null'?null:id)), money(v), pct(v,total)]),
          ['Total','', money(total),'100%']) })}
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
    data:{ labels:catL, datasets:[{ data:catV, backgroundColor:catL.map((_,i)=>PAL[i]),
      borderColor:INK.surface, borderWidth:2, hoverOffset:6 }]},
    options:{ cutout:'58%', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${c.label}: ${money(c.parsed)} (${pct(c.parsed,total)})`}}} }
  });
  S.charts.deEmp = new Chart($('#chDeEmp'), {
    type:'bar',
    data:{ labels:emps.map(e=>e[0]), datasets:[{ label:'Despesas', data:emps.map(e=>e[1]),
      backgroundColor:PAL[0], borderRadius:{topRight:4,bottomRight:4}, borderSkipped:false, maxBarThickness:24 }]},
    options:{ indexAxis:'y', plugins:{legend:{display:false},
      tooltip:{...tooltipCfg, callbacks:{label:c=>` ${money(c.parsed.x)} (${pct(c.parsed.x,total)})`}}},
      scales:{ x:{...axisMoney, beginAtZero:true}, y:{...axisCat, ticks:{padding:6, autoSkip:false}} } }
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
        <input type="file" id="file" accept="application/pdf" hidden>
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
   CONCILIAÇÃO BANCÁRIA
   ============================================================ */
const NATUREZA = {
  venda_pix:'PIX de venda', venda_cartao:'Cartão', venda_dinheiro:'Dinheiro / depósito',
  transferencia:'Transferência', pagamento:'Pagamento / saída', tarifa:'Tarifa',
  estorno:'Estorno', outro:'Não classificado'
};
const NAT_COR = {
  venda_pix:PAL[2], venda_cartao:PAL[0], venda_dinheiro:PAL[5],
  transferencia:PAL[6], pagamento:PAL[1], tarifa:PAL[3], estorno:PAL[7], outro:PAL[4]
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

  const entradas = rows.filter(r=>r.tipo==='credito');
  const saidas   = rows.filter(r=>r.tipo==='debito');
  const tEnt = sum(entradas), tSai = sum(saidas);
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
    <td>${esc(r.descricao)}</td>
    <td>${nat}</td>
    <td class="num"><b class="${r.tipo==='credito'?'pos':''}">${r.tipo==='credito'?'+':'−'} ${money(r.valor)}</b></td>
    <td><span class="pill"><i style="background:${r.conciliado?'var(--good)':'var(--warning)'}"></i>${r.conciliado?'Conciliado':'Pendente'}</span></td>
    <td>${S.admin?`<div class="rowacts">
      <button class="iconbtn" data-tog="${id}" data-v="${r.conciliado?1:0}" title="${r.conciliado?'Marcar como pendente':'Marcar como conciliado'}">${svg(I.link,15)}</button>
      <button class="iconbtn del" data-del="${id}" title="Excluir">${svg(I.trash,15)}</button></div>`:''}</td>
  </tr>`;
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
        <small>.ofx, .csv ou .txt exportado do internet banking</small>
        <input type="file" id="file" accept=".ofx,.csv,.txt,text/csv" hidden>
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
    const v = parseFloat(g('TRNAMT')||'0');
    const desc = [g('MEMO'), g('NAME')].filter(Boolean).join(' — ') || 'Lançamento';
    out.push({ data, descricao: desc.slice(0,200), valor: Math.abs(v),
      tipo: v < 0 ? 'debito' : 'credito', documento: g('CHECKNUM')||g('FITID')||null,
      contraparte: g('NAME')||null });
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
  const itens = /<STMTTRN>/i.test(txt) ? parseOFX(txt) : parseCSVExtrato(txt);
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

