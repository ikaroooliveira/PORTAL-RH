/**
 * Apresentação do resultado do cálculo (ROC de /regime-geral ou ObservabilidadeROC).
 * Somente exibe o que a API devolveu. A única conta feita aqui é a soma dos totais
 * (CBS + IBS + IS) exibida como "Total dos tributos", em aritmética decimal exata.
 */
import { brl, pct, qtd, esc, somaDecimal } from './format.js';
import { baixar, csv, stamp, copiar, linha } from './ui.js';

const ESTADOS = {
  CALCULADO: ['ok', 'Calculado'],
  CALCULO_SIMULADO: ['warn', 'Cálculo simulado'],
  INCONSISTENCIA_ENTRADA: ['bad', 'Inconsistência na entrada'],
  NAO_IMPLEMENTADO: ['warn', 'Não implementado'],
  FALHA_TECNICA: ['bad', 'Falha técnica'],
};
/** Rótulos derivados dos nomes do enum TipoWarningDadosSimulados do backend. */
const AVISO_SIMULADO = {
  1: 'caso geral', 2: 'compras governamentais', 3: 'Imposto Seletivo',
  4: 'compras governamentais com Imposto Seletivo', 5: 'alíquotas fictícias', 6: 'cálculos simulados',
};
const GRUPOS = {
  gMonoPadrao: 'Monofasia — padrão', gMonoReten: 'Monofasia — retenção', gMonoRet: 'Monofasia — retido anteriormente', gMonoDif: 'Monofasia — diferimento',
  gCredPresOper: 'Crédito presumido da operação', gCredPresIBSZFM: 'Crédito presumido IBS (ZFM)', gTransfCred: 'Transferência de crédito',
  gAjusteCompet: 'Ajuste de competência', gEstornoCred: 'Estorno de crédito', gTribCompraGov: 'Compra governamental (composição)',
  gIBSCBSMono: 'IBS/CBS monofásico', gTribRegular: 'Tributação regular',
};

const val = (o, ...path) => path.reduce((a, k) => (a == null ? undefined : a[k]), o);
const tem = (v) => v !== undefined && v !== null && v !== '';

function tagEstado(estado) {
  const [cls, txt] = ESTADOS[estado] || ['', estado];
  return `<span class="tag ${cls}">${esc(txt)}</span>`;
}

/** Extrai uma visão plana de um objeto (item) do ROC. */
export function itemView(obj) {
  const t = obj.tribCalc || {};
  const ic = t.IBSCBS || {};
  const g = ic.gIBSCBS || {};
  const estado = obj.estadoItem || (obj.calculoSimulado ? 'CALCULO_SIMULADO' : 'CALCULADO');
  return {
    n: obj.nObj, estado, simulado: estado === 'CALCULO_SIMULADO' || obj.calculoSimulado === true,
    cst: ic.CST, cc: ic.cClassTrib, vBC: g.vBC, cbs: g.gCBS, uf: g.gIBSUF, mun: g.gIBSMun, vIBS: g.vIBS,
    is: t.IS, reg: g.gTribRegular, gov: g.gTribCompraGov, ic, memoria: ic.memoriaCalculo, erros: obj.erros || [],
    temTrib: !!(t.IBSCBS || t.IS),
  };
}

export function totais(data) {
  const tot = val(data, 'total', 'tribCalc') || {};
  const ibscbs = tot.IBSCBSTot || {};
  const cbs = val(ibscbs, 'gCBS', 'vCBS');
  const ibsUf = val(ibscbs, 'gIBS', 'gIBSUF', 'vIBSUF');
  const ibsMun = val(ibscbs, 'gIBS', 'gIBSMun', 'vIBSMun');
  const ibs = val(ibscbs, 'gIBS', 'vIBS');
  const is = val(tot, 'ISTot', 'vIS');
  return {
    tot, ibscbs, cbs, ibsUf, ibsMun, ibs, is,
    base: ibscbs.vBCIBSCBS,
    total: somaDecimal([cbs, ibs, is]),
  };
}

function linhaTrib(nome, base, aliq, g, extraSub = '') {
  if (!g) return '';
  const p = aliq;
  const red = g.gRed;
  let rows = `<tr><td>${nome}</td><td>${brl(base)}</td><td>${tem(p) ? pct(p) : '—'}</td>
    <td>${red ? pct(red.pRedAliq) : '—'}</td><td>${red ? pct(red.pAliqEfet) : '—'}</td><td><b>${brl(g.__v)}</b></td></tr>`;
  if (g.gDif) rows += `<tr class="sub"><td colspan="3">↳ Diferimento (${pct(g.gDif.pDif)})</td><td></td><td></td><td>${brl(g.gDif.vDif)}</td></tr>`;
  if (g.gDevTrib) rows += `<tr class="sub"><td colspan="3">↳ Devolução de tributos (${pct(g.gDevTrib.pDevTrib)})</td><td></td><td></td><td>${brl(g.gDevTrib.vDevTrib)}</td></tr>`;
  return rows + extraSub;
}

/** Renderiza chave/valor de grupos que a API devolve (sem interpretar), ocultando objetos vazios. */
function kvGrupo(obj, nivel = 0) {
  if (obj == null || typeof obj !== 'object') return '';
  const itens = Object.entries(obj).map(([k, v]) => {
    if (v && typeof v === 'object') return `<dt>${esc(k)}</dt><dd>${kvGrupo(v, nivel + 1)}</dd>`;
    const dinheiro = /^v[A-Z]/.test(k);
    const aliq = /^p[A-Z]/.test(k);
    const txt = dinheiro && /^-?\d+(\.\d+)?$/.test(String(v)) ? brl(v) : aliq && /^-?\d+(\.\d+)?$/.test(String(v)) ? pct(v) : esc(v);
    return `<dt>${esc(k)}</dt><dd>${txt}</dd>`;
  }).join('');
  return itens ? `<dl class="kv" style="${nivel ? 'font-size:13px' : ''}">${itens}</dl>` : '';
}

function cartaoItem(v, payloadItens) {
  const it = payloadItens && payloadItens.find((x) => x.numero === v.n);
  const ident = it ? [it.ncm && `NCM ${it.ncm}`, it.nbs && `NBS ${it.nbs}`].filter(Boolean).join(' · ') : '';
  const g = v.ic.gIBSCBS || {};
  const linhas = [];
  if (v.cbs) linhas.push(linhaTrib('CBS', v.vBC, v.cbs.pCBS, { ...v.cbs, __v: v.cbs.vCBS }));
  if (v.uf) linhas.push(linhaTrib('IBS estadual', v.vBC, v.uf.pIBSUF, { ...v.uf, __v: v.uf.vIBSUF }));
  if (v.mun) linhas.push(linhaTrib('IBS municipal', v.vBC, v.mun.pIBSMun, { ...v.mun, __v: v.mun.vIBSMun }));
  if (tem(v.vIBS)) linhas.push(`<tr class="tot"><td>IBS total</td><td></td><td></td><td></td><td></td><td>${brl(v.vIBS)}</td></tr>`);
  if (v.is) {
    const i = v.is;
    linhas.push(`<tr><td>Imposto Seletivo</td><td>${brl(i.vBCIS)}</td><td>${tem(i.pIS) ? pct(i.pIS) : '—'}${tem(i.adRemIS) ? ` + ${brl(i.adRemIS)}/${esc(i.uTrib || 'un')}` : ''}</td><td>—</td><td>—</td><td><b>${brl(i.vIS)}</b></td></tr>`);
    if (tem(i.qTrib)) linhas.push(`<tr class="sub"><td colspan="6">↳ Quantidade tributável: ${qtd(i.qTrib)} ${esc(i.uTrib || '')}</td></tr>`);
  }
  const tabela = linhas.length ? `<div class="tbl"><table class="res"><thead><tr><th>Tributo</th><th>Base de cálculo</th><th>Alíquota</th><th>Redução</th><th>Alíq. efetiva</th><th>Valor</th></tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : '';

  const reg = v.reg ? `<div class="calc-note" style="margin-top:10px"><b>Tributação regular</b> (CST ${esc(v.reg.CSTReg)} · ${esc(v.reg.cClassTribReg)})</div>
    <div class="tbl"><table class="res"><thead><tr><th>Tributo</th><th>Alíq. efetiva</th><th>Valor</th></tr></thead><tbody>
    <tr><td>CBS</td><td>${pct(v.reg.pAliqEfetRegCBS)}</td><td>${brl(v.reg.vTribRegCBS)}</td></tr>
    <tr><td>IBS estadual</td><td>${pct(v.reg.pAliqEfetRegIBSUF)}</td><td>${brl(v.reg.vTribRegIBSUF)}</td></tr>
    <tr><td>IBS municipal</td><td>${pct(v.reg.pAliqEfetRegIBSMun)}</td><td>${brl(v.reg.vTribRegIBSMun)}</td></tr></tbody></table></div>` : '';

  const extras = ['gIBSCBSMono', 'gCredPresOper', 'gCredPresIBSZFM', 'gTransfCred', 'gAjusteCompet', 'gEstornoCred']
    .filter((k) => v.ic[k]).map((k) => `<details class="mem"><summary>${esc(GRUPOS[k])}</summary>${kvGrupo(v.ic[k])}</details>`).join('')
    + (g.gTribCompraGov ? `<details class="mem"><summary>${esc(GRUPOS.gTribCompraGov)}</summary>${kvGrupo(g.gTribCompraGov)}</details>` : '');

  const mem = v.memoria ? [['CBS', v.memoria.cbs], ['IBS estadual', v.memoria.ibsUF], ['IBS municipal', v.memoria.ibsMun]].filter(([, t]) => t)
    .map(([n, t]) => `<div><b>${n}</b><pre>${esc(t)}</pre></div>`).join('') : '';
  const memIs = v.is && v.is.memoriaCalculo ? `<div><b>Imposto Seletivo</b><pre>${esc(v.is.memoriaCalculo)}</pre></div>` : '';
  const memoria = (mem || memIs) ? `<details class="mem"><summary>Memória de cálculo</summary>${mem}${memIs}</details>` : '';

  const erros = v.erros.length ? `<div class="alert bad card" style="margin:10px 0 0"><b>Inconsistências deste item</b>${v.erros.map(erroItem).join('')}</div>` : '';

  return `<div class="card item-res">
    <div class="top"><div><b>Item ${esc(v.n)}</b> <span class="mini">${esc(ident)}${v.cst ? ` · CST ${esc(v.cst)} · cClassTrib ${esc(v.cc)}` : ''}</span></div>${tagEstado(v.estado)}</div>
    ${tabela}${reg}${extras}${memoria}${erros}
  </div>`;
}

function erroItem(e) {
  return `<div class="err-item"><b>${esc(e.title || e.code)}</b> ${e.code ? `<code>${esc(e.code)}</code>` : ''}
    ${e.detail ? `<div>${esc(e.detail)}</div>` : ''}${e.pointer ? `<div><code>${esc(e.pointer)}</code></div>` : ''}</div>`;
}

export function renderResultado(box, res) {
  const { data, modo, headers } = res;
  const t = totais(data);
  const objs = (data.objetos || []).map(itemView);
  const payloadItens = res.payload && res.payload.itens;
  const problemas = objs.filter((o) => o.estado === 'INCONSISTENCIA_ENTRADA' || o.estado === 'FALHA_TECNICA' || o.estado === 'NAO_IMPLEMENTADO');
  const simulados = objs.some((o) => o.simulado) || headers.aviso;

  const avisoSim = headers.aviso
    ? `<div class="card alert"><b>Dados simulados</b><div class="ext">A API sinalizou cálculo com dados simulados (<code>x-warning-dados-simulados: ${esc(headers.aviso)}</code> — ${esc(AVISO_SIMULADO[headers.aviso] || 'ver documentação da API')}). Os valores não devem ser usados como definitivos.</div></div>`
    : (simulados ? `<div class="card alert"><b>Cálculo simulado</b><div class="ext">Há itens calculados com alíquotas informadas pelo usuário (<code>CALCULO_SIMULADO</code>).</div></div>` : '');

  const alertaProb = problemas.length
    ? `<div class="card alert bad"><b>${problemas.length} item(ns) com inconsistência — ${problemas.length === objs.length ? 'nenhum item foi calculado' : 'os totais somam apenas os itens calculados'}</b>
       <ul>${problemas.map((p) => `<li>Item ${esc(p.n)}: ${esc((p.erros[0] && (p.erros[0].detail || p.erros[0].title)) || ESTADOS[p.estado][1])}</li>`).join('')}</ul></div>` : '';

  const kpi = (r, v, sub, cls = '') => `<div class="salario-kpi ${cls}"><span>${r}</span><strong>${v}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const kpis = `<div class="kpis">
    ${kpi('CBS', brl(t.cbs ?? '0.00'))}
    ${kpi('IBS estadual', brl(t.ibsUf ?? '0.00'))}
    ${kpi('IBS municipal', brl(t.ibsMun ?? '0.00'))}
    ${kpi('Imposto Seletivo (IS)', brl(t.is ?? '0.00'))}
    ${kpi('Total dos tributos', brl(t.total), 'CBS + IBS + IS (soma dos totais da API)', 'tot')}
    ${kpi('Base de cálculo IBS/CBS', brl(t.base ?? '0.00'))}
  </div>`;

  const ibsT = t.ibscbs.gIBS || {};
  const cbsT = t.ibscbs.gCBS || {};
  const consolidado = `<div class="card"><h2>Totais consolidados da operação</h2>
    <div class="tbl"><table class="res"><thead><tr><th>Tributo</th><th>Diferimento</th><th>Devolução</th><th>Crédito presumido</th><th>Valor</th></tr></thead><tbody>
    <tr><td>CBS</td><td>${brl(cbsT.vDif)}</td><td>${brl(cbsT.vDevTrib)}</td><td>${brl(cbsT.vCredPres)}</td><td><b>${brl(cbsT.vCBS)}</b></td></tr>
    <tr><td>IBS estadual</td><td>${brl(val(ibsT, 'gIBSUF', 'vDif'))}</td><td>${brl(val(ibsT, 'gIBSUF', 'vDevTrib'))}</td><td>—</td><td><b>${brl(val(ibsT, 'gIBSUF', 'vIBSUF'))}</b></td></tr>
    <tr><td>IBS municipal</td><td>${brl(val(ibsT, 'gIBSMun', 'vDif'))}</td><td>${brl(val(ibsT, 'gIBSMun', 'vDevTrib'))}</td><td>—</td><td><b>${brl(val(ibsT, 'gIBSMun', 'vIBSMun'))}</b></td></tr>
    <tr class="tot"><td>IBS total</td><td></td><td></td><td>${brl(ibsT.vCredPres)}</td><td>${brl(ibsT.vIBS)}</td></tr>
    <tr><td>Imposto Seletivo</td><td>—</td><td>—</td><td>—</td><td><b>${brl(t.is ?? '0.00')}</b></td></tr></tbody></table></div>
    ${t.ibscbs.gMono && Object.keys(t.ibscbs.gMono).length ? `<details class="mem"><summary>Totais de monofasia</summary>${kvGrupo(t.ibscbs.gMono)}</details>` : ''}
    ${t.ibscbs.gEstornoCred ? `<details class="mem"><summary>Estorno de crédito</summary>${kvGrupo(t.ibscbs.gEstornoCred)}</details>` : ''}
  </div>`;

  const cg = val(data, 'oper', 'gCompraGov');
  const gov = cg ? `<div class="card"><h2>Compra governamental</h2>${kvGrupo(cg)}</div>` : '';

  box.innerHTML = `
    <div class="toolbar no-print" style="margin-top:6px"><div class="sec-t" style="margin:0">Resultado ${modo === 'obs' ? '· cálculo com observabilidade' : '· cálculo estrito (regime-geral)'}
      ${headers.app ? `<span class="mini"> · API v${esc(headers.app)} · base ${esc(headers.db || '')}</span>` : ''}</div>
      <div class="actions">
        <button class="btn sec sm2" data-x="csv" type="button">Exportar CSV</button>
        <button class="btn sec sm2" data-x="json" type="button">Exportar JSON</button>
        <button class="btn sec sm2" data-x="print" type="button">Imprimir / PDF</button>
        <button class="btn sec sm2" data-x="xml" type="button">Gerar XML</button>
      </div></div>
    <div class="print-only"><h2>Calculadora da Reforma Tributária — resultado</h2>
      <div class="ext">Operação ${esc(res.payload && res.payload.id)} · fato gerador ${esc(res.payload && res.payload.dhFatoGerador)} · UF ${esc(res.payload && res.payload.uf)} · município ${esc(res.payload && res.payload.municipio)}</div></div>
    ${avisoSim}${alertaProb}${kpis}${consolidado}${gov}
    <div class="sec-t" style="margin:14px 0 10px">Detalhamento por item</div>
    ${objs.map((o) => cartaoItem(o, payloadItens)).join('') || '<div class="card ph">A API não devolveu itens.</div>'}`;
  return { objs, t };
}

/* ---------- exportações ---------- */
export function exportarCsv(res) {
  const objs = (res.data.objetos || []).map(itemView);
  const t = totais(res.data);
  const cab = ['Item', 'NCM', 'NBS', 'Estado', 'CST', 'cClassTrib', 'Base IBS/CBS', 'Aliq CBS %', 'CBS', 'Aliq IBS UF %', 'IBS estadual', 'Aliq IBS Mun %', 'IBS municipal', 'IBS total', 'IS', 'Mensagens'];
  const rows = [cab];
  for (const o of objs) {
    const it = (res.payload.itens || []).find((x) => x.numero === o.n) || {};
    rows.push([o.n, it.ncm || '', it.nbs || '', o.estado, o.cst || '', o.cc || '', o.vBC ?? '',
      val(o.cbs, 'pCBS') ?? '', val(o.cbs, 'vCBS') ?? '', val(o.uf, 'pIBSUF') ?? '', val(o.uf, 'vIBSUF') ?? '',
      val(o.mun, 'pIBSMun') ?? '', val(o.mun, 'vIBSMun') ?? '', o.vIBS ?? '', val(o.is, 'vIS') ?? '',
      o.erros.map((e) => `${e.code || ''} ${e.detail || e.title || ''}`.trim()).join(' | ')]);
  }
  rows.push([]);
  rows.push(['TOTAL', '', '', '', '', '', t.base ?? '', '', t.cbs ?? '', '', t.ibsUf ?? '', '', t.ibsMun ?? '', t.ibs ?? '', t.is ?? '', '']);
  rows.push(['Total dos tributos (CBS+IBS+IS)', '', '', '', '', '', '', '', t.total]);
  baixar(`calculo-rtc-${stamp()}.csv`, csv(rows), 'text/csv;charset=utf-8');
}
export function exportarJson(res) {
  baixar(`calculo-rtc-${stamp()}.json`, JSON.stringify({ requisicao: res.payload, resposta: res.data, modo: res.modo }, null, 2), 'application/json');
}
export { copiar, linha };
