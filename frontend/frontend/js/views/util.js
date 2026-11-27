/** Utilitários compartilhados pelas telas de consulta/base/XML. */
import { esc, brl, pct, parseDec, Dec, hojeISO } from '../format.js';
import { erroHtml } from '../ui.js';
export const fmtVal = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number' && /^(v|valor|base)/i.test(k)) return brl(v);
  if (typeof v === 'number' && /aliq|^p[A-Z]|perc/i.test(k)) return pct(v);
  if (typeof v === 'object') return `<code>${esc(JSON.stringify(v))}</code>`;
  return esc(v);
};
/** Tabela genérica a partir de uma lista de objetos (colunas = chaves do retorno real da API). */
export function tabela(rows, cols) {
  if (!rows || !rows.length) return '<div class="msg">Nenhum registro retornado pela API.</div>';
  cols = cols || [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] === null);
  return `<div class="tbl"><table class="res list"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="l">${fmtVal(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/** Objeto simples -> lista chave/valor. */
export function kv(o) {
  return `<div class="tbl"><table class="res list"><tbody>${Object.entries(o || {}).map(([k, v]) => `<tr><th class="l">${esc(k)}</th><td class="l">${Array.isArray(v) ? (v.length ? v.map((x) => typeof x === 'object' ? `<code>${esc(JSON.stringify(x))}</code>` : esc(x)).join('<br>') : '—') : fmtVal(k, v)}</td></tr>`).join('')}</tbody></table></div>`;
}
export const campo = (id, rotulo, ph = '0,00') => `<div><label for="${id}">${esc(rotulo)}</label><input id="${id}" inputmode="decimal" placeholder="${ph}"></div>`;
export const select = (id, rotulo, opcoes) => `<div><label for="${id}">${esc(rotulo)}</label><select id="${id}">${opcoes.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`;
export const erro = (box, e) => { box.innerHTML = erroHtml(e); };
export { hojeISO, Dec, esc };
export const filtra = (rows, q) => { q = (q || '').toLowerCase().trim(); return q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows; };
