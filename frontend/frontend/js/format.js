/** Formatação e leitura de números no padrão brasileiro. Valores monetários da API são strings decimais. */

const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const nfNum = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const nf2 = nfNum(2, 2);
const nfPct = nfNum(2, 4);
const nfQtd = nfNum(0, 4);

const isBlank = (v) => v === null || v === undefined || v === '';

export function brl(v) {
  if (isBlank(v)) return '—';
  try { return nfBRL.format(String(v)); } catch { return String(v); }
}
export function num2(v) { return isBlank(v) ? '—' : nf2.format(String(v)); }
export function pct(v) { return isBlank(v) ? '—' : nfPct.format(String(v)) + '%'; }
export function qtd(v) { return isBlank(v) ? '—' : nfQtd.format(String(v)); }
export function dataBR(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/**
 * Lê um número digitado pelo usuário ("1.234,56", "1234,56" ou "1234.56") e devolve
 * uma string decimal canônica ("1234.56"), sem passar por ponto flutuante.
 * Retorna '' se vazio e null se inválido.
 */
export function parseDec(input) {
  let s = String(input ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (s === '') return '';
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

/** Confere casas inteiras/decimais (equivalente a @Digits do backend). */
export function digitsOk(dec, maxInt, maxFrac) {
  const [i, f = ''] = String(dec).split('.');
  return i.replace(/^0+(?=\d)/, '').length <= maxInt && f.length <= maxFrac;
}

/** Soma exata de strings decimais (BigInt em centavos) — usada só para exibir o "total dos tributos". */
export function somaDecimal(valores, casas = 2) {
  let total = 0n;
  for (const v of valores) {
    if (isBlank(v)) continue;
    const [i, f = ''] = String(v).split('.');
    const frac = (f + '0'.repeat(casas)).slice(0, casas);
    const neg = i.startsWith('-');
    const n = BigInt(i.replace('-', '') || '0') * 10n ** BigInt(casas) + BigInt(frac || '0');
    total += neg ? -n : n;
  }
  const neg = total < 0n;
  const abs = (neg ? -total : total).toString().padStart(casas + 1, '0');
  return (neg ? '-' : '') + abs.slice(0, -casas) + '.' + abs.slice(-casas);
}

export const onlyDigits = (s) => String(s ?? '').replace(/\D+/g, '');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function hojeISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Serializa o corpo da requisição escrevendo decimais como literais numéricos exatos
 * (sem arredondamento de double). Use new Dec('123.45') para marcar um decimal.
 */
export class Dec { constructor(s) { this.s = s; } }
export function stringifyPayload(obj, indent) {
  const marks = [];
  const json = JSON.stringify(obj, (k, v) => {
    if (v instanceof Dec) { marks.push(v.s); return `__DEC${marks.length - 1}__`; }
    return v;
  }, indent);
  return json.replace(/"__DEC(\d+)__"/g, (_, i) => marks[Number(i)]);
}

export function novoIdOperacao() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
