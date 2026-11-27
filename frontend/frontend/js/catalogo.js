/** Carga de catálogos da API reutilizados em várias telas (CST/cClassTrib, tipos de DFe, UF/município). */
import { api } from './api.js';
import { esc } from './format.js';

/** CST + cClassTrib vigentes na data (CBS/IBS e IS). Falhas parciais viram lista vazia, com o erro anexado. */
export async function carregaCst(data, siglaDfe) {
  const out = { cbs: [], is: [], erroCbs: null, erroIs: null };
  const [a, b] = await Promise.allSettled([api.cstCbsIbs(data, siglaDfe), api.cstIs(data, siglaDfe)]);
  if (a.status === 'fulfilled') out.cbs = a.value.data || []; else out.erroCbs = a.reason;
  if (b.status === 'fulfilled') out.is = b.value.data || []; else out.erroIs = b.reason;
  return out;
}

/** Tipos de documento (modelo ↔ sigla) que a calculadora trata. */
export async function carregaDfe(data) {
  try {
    const { data: grupos } = await api.gruposDfe(data);
    return (grupos || []).flatMap((g) => (g.tipos || []).map((t) => ({ ...t, grupo: g.titulo })));
  } catch { return []; }
}

export function optionsUf(ufs, selecionada = '', vazio = 'Selecione') {
  return `<option value="">${esc(vazio)}</option>` +
    ufs.map((u) => `<option value="${esc(u.sigla)}" ${u.sigla === selecionada ? 'selected' : ''}>${esc(u.sigla)} — ${esc(u.nome)}</option>`).join('');
}

export function optionsMunicipios(lista) {
  return lista.map((m) => `<option value="${esc(m.nome)} (${m.codigo})"></option>`).join('');
}

/** Extrai o código IBGE de "Nome (1234567)" ou de um número digitado. */
export function codigoMunicipio(texto, lista) {
  const t = String(texto || '').trim();
  const m = /\((\d{7})\)\s*$/.exec(t);
  if (m) return Number(m[1]);
  if (/^\d{1,7}$/.test(t)) return Number(t);
  const achado = lista && lista.find((x) => x.nome.toLowerCase() === t.toLowerCase());
  return achado ? achado.codigo : null;
}

/** Procura a descrição de um CST/cClassTrib nos catálogos carregados. */
export function descCst(lista, cst) {
  const s = lista.find((x) => x.codigo === cst);
  return s ? s.descricao : '';
}
export function descClass(lista, cst, cc) {
  const pool = cst ? lista.filter((x) => x.codigo === cst) : lista;
  for (const s of pool) {
    const c = (s.classificacoesTributarias || []).find((k) => k.codigo === cc);
    if (c) return c.descricao;
  }
  return '';
}
