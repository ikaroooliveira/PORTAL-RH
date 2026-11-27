/** Utilitários de interface compartilhados pelas telas. */
import { esc } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Toasts ---------- */
export function toast(msg, tipo = 'ok', ms = 4200) {
  let wrap = $('#toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------- Download / cópia ---------- */
export function baixar(nome, conteudo, mime = 'text/plain;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado para a área de transferência.'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copiado para a área de transferência.'); } catch { toast('Não foi possível copiar.', 'bad'); }
    ta.remove();
  }
}
export function stamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------- CSV (padrão Excel pt-BR: ; e vírgula decimal, com BOM) ---------- */
export function csv(rows) {
  const cel = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^-?\d+\.\d+$/.test(s)) s = s.replace('.', ',');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\ufeff' + rows.map((r) => r.map(cel).join(';')).join('\r\n');
}

/* ---------- Erros ---------- */
export function erroHtml(err) {
  if (!err) return '';
  const det = err.detail ? `<div class="ext">${esc(err.detail)}</div>` : '';
  const status = err.status ? `<span class="tag bad">HTTP ${err.status}</span> ` : err.network ? '<span class="tag bad">Sem conexão</span> ' : '';
  return `<div class="card alert bad" role="alert"><b>${status}${esc(err.title || err.message)}</b>${det}</div>`;
}

/* ---------- Botão com estado de carregamento ---------- */
export async function comCarga(btn, fn) {
  if (btn.disabled) return;
  const txt = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span> Processando…`;
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = txt; }
}

/* ---------- Modal (reaproveita .modal/.box2 do Portal RH) ---------- */
export function modal(titulo, corpoHtml, { largo = false } = {}) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.style.display = 'block';
  m.innerHTML = `<div class="box2 ${largo ? 'largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="sel"><h2>${esc(titulo)}</h2><button class="btn sec" type="button" data-fechar>Fechar</button></div>
    <div data-corpo style="margin-top:12px">${corpoHtml}</div></div>`;
  const fechar = () => { m.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', esc_);
  document.body.appendChild(m);
  return { el: m, corpo: $('[data-corpo]', m), fechar };
}

/** Debounce simples. */
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Cartão de chave/valor no estilo calc-result-line do Portal RH. */
export const linha = (rotulo, valor) =>
  `<div class="calc-result-line"><span>${esc(rotulo)}</span><strong>${valor}</strong></div>`;

export const sim = (b) => (b ? '<span class="tag ok">Sim</span>' : '<span class="tag">Não</span>');
