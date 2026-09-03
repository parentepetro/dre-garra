/**
 * Le a DRE do Imex (relatorio 08 - Demonstrativo de resultado).
 *
 * O contas a pagar NAO serve como fonte da DRE: ele nao tem as despesas
 * financeiras, nem a taxa de cartao, e fica uns R$ 100 mil por mes abaixo
 * do que o proprio Imex mostra. A fonte certa e o relatorio.
 *
 * O relatorio volta como PDF em base64, e por sorte ele vem sem compressao:
 * o texto esta em operadores "Tm (texto) Tj", com a coluna dada pelo x e a
 * linha pelo y. Da para ler sem nenhuma biblioteca.
 *
 * Colunas do relatorio (posicao x aproximada):
 *    30 = numero reduzido      51 = codigo da conta
 *   120 = nome                329 = percentual        >360 = valor
 */

const REL_DRE = 1008;

const Q_RELATORIO = `query r($id: Float!, $list: [RelatorioAutoXPertItensInput!]!) {
  relatorioAutoXPert(id:$id, list:$list) { nome folder pdf } }`;

/** dd/mm/aaaa a partir de aaaa-mm-dd */
const br = iso => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };

/** Extrai as linhas de texto de um PDF sem compressao. */
function textoDoPdf(buf) {
  const s = buf.toString('latin1');
  const re = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  const itens = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    itens.push({
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
      t: m[3].replace(/\\([()\\])/g, '$1').trim(),
    });
  }
  // agrupa em linhas: itens seguidos com o mesmo y sao a mesma linha
  const linhas = [];
  let atual = null;
  for (const it of itens) {
    if (!atual || it.y !== atual.y) { atual = { y: it.y, itens: [] }; linhas.push(atual); }
    atual.itens.push(it);
  }
  return linhas;
}

const numero = t => {
  const n = Number(String(t).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};

/**
 * Converte o PDF em { codigo: { nome, valor } }.
 * So o que interessa: linhas que tem codigo de conta e valor.
 */
function lerDre(buf) {
  const contas = {};
  for (const l of textoDoPdf(buf)) {
    const cod  = l.itens.find(i => i.x > 45  && i.x < 70  && /^\d+(\.\d+)*$/.test(i.t));
    const nome = l.itens.find(i => i.x > 100 && i.x < 320);
    const val  = l.itens.filter(i => i.x > 360 && /^-?[\d.]+,\d{2}$/.test(i.t)).pop();
    if (!cod || !val) continue;
    const v = numero(val.t);
    if (v === null) continue;
    contas[cod.t] = { nome: (nome?.t || '').trim(), valor: v };
  }
  return contas;
}

/**
 * So as contas "folha" de um prefixo — as que nao tem nenhuma filha no
 * proprio relatorio. Somar as folhas evita contar o mesmo valor duas vezes
 * (o relatorio traz o grupo e os itens dele).
 */
function folhasDe(contas, prefixo) {
  const cods = Object.keys(contas);
  return cods
    .filter(c => c.startsWith(prefixo + '.') || c === prefixo)
    .filter(c => !cods.some(o => o !== c && o.startsWith(c + '.')))
    .sort();
}

/**
 * Busca a DRE do periodo. `gql` e a funcao de consulta do robo.
 * regimeCaixa = true reproduz o "Considerar despesas pelo regime de caixa".
 */
async function buscarDre(gql, { filial, ini, fim, regimeCaixa = true }) {
  const d = await gql(Q_RELATORIO, { id: REL_DRE, list: [
    { tag: 1,   vlr: String(filial) },
    { tag: 101, vlr: '1' },
    { tag: 102, vlr: '0' },
    { tag: 105, vlr: regimeCaixa ? '1' : '0' },
    { tag: 108, vlr: '0' },
    { tag: 201, vlr: br(ini) },
    { tag: 202, vlr: br(fim) },
  ] });
  const pdf = d?.relatorioAutoXPert?.pdf;
  if (!pdf) throw new Error('o Imex nao devolveu o PDF da DRE');
  return lerDre(Buffer.from(pdf, 'base64'));
}

module.exports = { buscarDre, lerDre, textoDoPdf, folhasDe, REL_DRE };
