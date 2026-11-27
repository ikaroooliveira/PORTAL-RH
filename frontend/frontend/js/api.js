/**
 * Cliente HTTP da calculadora RTC. Todos os endpoints do backend Java passam por aqui.
 * Nenhum cálculo ou regra tributária é feito no navegador.
 */
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, title = '', detail = '', problem = null, network = false, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status; this.title = title; this.detail = detail;
    this.problem = problem; this.network = network; this.url = url;
  }
}

let pending = 0;
const listeners = new Set();
export function onLoading(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function bump(d) { pending += d; listeners.forEach((fn) => fn(pending)); }

const cache = new Map();

function buildUrl(path, query) {
  const url = `${CONFIG.API_BASE_URL}${CONFIG.API_PREFIX}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function request(method, path, { query, body, contentType, accept = 'application/json', cacheKey, signal } = {}) {
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
  const url = buildUrl(path, query);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => ctl.abort());
  const headers = { Accept: accept };
  if (body !== undefined) headers['Content-Type'] = contentType || 'application/json';
  bump(1);
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: ctl.signal });
  } catch (e) {
    const timeout = e && e.name === 'AbortError';
    throw new ApiError(timeout ? 'Tempo limite excedido ao consultar a API.' : 'Não foi possível conectar à API.', {
      network: true, url,
      detail: timeout
        ? `A API não respondeu em ${CONFIG.TIMEOUT_MS / 1000}s.`
        : `Verifique se o backend Java está em execução e se a URL da API (${CONFIG.API_BASE_URL}) está correta.`,
    });
  } finally {
    clearTimeout(timer);
    bump(-1);
  }

  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  let data = text;
  if (ct.includes('json') && text) { try { data = JSON.parse(text); } catch { /* mantém texto */ } }

  if (!res.ok) {
    const p = data && typeof data === 'object' ? data : null;
    const title = (p && p.title) || `Erro HTTP ${res.status}`;
    const detail = (p && (p.detail || p.message)) || (typeof data === 'string' ? data.slice(0, 600) : '');
    throw new ApiError(title, { status: res.status, title, detail, problem: p, url });
  }
  const out = { data, status: res.status, headers: res.headers };
  if (cacheKey) cache.set(cacheKey, out);
  return out;
}

const get = (path, query, opt = {}) => request('GET', path, { query, ...opt });
const postJson = (path, obj, query, opt = {}) =>
  request('POST', path, { query, body: typeof obj === 'string' ? obj : JSON.stringify(obj), ...opt });

const DA = '/dados-abertos';

export const api = {
  limparCache: () => cache.clear(),

  /* ---------- Cálculo ---------- */
  calcularRegimeGeral: (jsonBody) => postJson('/regime-geral', jsonBody),
  calcularObservabilidade: (jsonBody) => postJson('/observabilidade/regime-geral', jsonBody),
  descricaoErro: (codigo) => get('/observabilidade/erros', { codigo }),

  /* ---------- Base de cálculo ---------- */
  baseUnificada: (b) => postJson('/base-calculo/base-calculo-unificada', b),
  baseUnificadaNfse: (b) => postJson('/base-calculo/base-calculo-unificada-nfse', b),
  baseIsMercadorias: (b) => postJson('/base-calculo/is-mercadorias', b),
  baseCbsIbsMercadorias: (b) => postJson('/base-calculo/cbs-ibs-mercadorias', b),

  /* ---------- XML ---------- */
  xmlTiposGeracao: () => get('/xml/generate', null, { cacheKey: 'xml-gen' }),
  xmlTiposValidacao: () => get('/xml/validate', null, { cacheKey: 'xml-val' }),
  xmlGerar: (rocJson, tipo) => postJson('/xml/generate', rocJson, { tipo }, { accept: 'application/xml' }),
  xmlValidar: (xml, tipo, subtipo) =>
    request('POST', '/xml/validate', { query: { tipo, subtipo }, body: xml, contentType: 'application/xml' }),

  /* ---------- Dados abertos ---------- */
  versao: () => get(`${DA}/versao`),
  ufs: () => get(`${DA}/ufs`, null, { cacheKey: 'ufs' }),
  municipios: (siglaUf) => get(`${DA}/ufs/municipios`, { siglaUf }, { cacheKey: `mun:${siglaUf}` }),
  gruposDfe: (data) => get(`${DA}/dfe/grupos`, { data }, { cacheKey: `dfe:${data}` }),
  cstCbsIbs: (data, siglaDfe) =>
    get(`${DA}/situacoes-tributarias/cbs-ibs`, { data, siglaDfe }, { cacheKey: `cst:${data}:${siglaDfe || ''}` }),
  cstIs: (data, siglaDfe) =>
    get(`${DA}/situacoes-tributarias/is`, { data, siglaDfe }, { cacheKey: `cstis:${data}:${siglaDfe || ''}` }),
  classificacaoCbsIbs: (cClassTrib, data) =>
    get(`${DA}/classificacoes-tributarias/cbs-ibs/class-trib/${encodeURIComponent(cClassTrib)}`, { data }),
  classificacaoIs: (cClassTrib, data) =>
    get(`${DA}/classificacoes-tributarias/is/class-trib/${encodeURIComponent(cClassTrib)}`, { data }),
  nomenclatura: (siglaDfe, cClassTrib, data) =>
    get(`${DA}/nomenclatura/${encodeURIComponent(siglaDfe)}/${encodeURIComponent(cClassTrib)}`, { data }),
  validadeDfeClassificacao: (siglaDfe, cClassTrib, data) =>
    get(`${DA}/classificacoes-tributarias/cbs-ibs/${encodeURIComponent(siglaDfe)}/${encodeURIComponent(cClassTrib)}`, { data }),
  ncm: (ncm, data) => get(`${DA}/ncm`, { ncm, data }),
  ncmVigentes: (data) => get(`${DA}/ncm/vigentes`, { data }, { cacheKey: `ncmv:${data}` }),
  nbs: (nbs, data) => get(`${DA}/nbs`, { nbs, data }),
  nbsLista: (data) => get(`${DA}/nbs/lista`, { data }, { cacheKey: `nbsl:${data}` }),
  classificacoesPorNbs: (nbs, data) => get(`${DA}/classificacoes-tributarias/nbs`, { nbs, data }),
  nbsAplicaveis: (cClassTrib, data) => get(`${DA}/nbs-aplicaveis`, { cClassTrib, data }),
  ncmAplicavel: (cClassTrib, ncm, dataOcorrenciaFatoGerador) =>
    get(`${DA}/classificacoes-tributarias/ncm-aplicavel`, { cClassTrib, ncm, dataOcorrenciaFatoGerador }),
  nbsAplicavel: (cClassTrib, nbs, dataOcorrenciaFatoGerador) =>
    get(`${DA}/classificacoes-tributarias/nbs-aplicavel`, { cClassTrib, nbs, dataOcorrenciaFatoGerador }),
  fundamentacoes: (data) => get(`${DA}/fundamentacoes-legais`, { data }, { cacheKey: `fund:${data}` }),
  aliquotaUniao: (data) => get(`${DA}/aliquota-uniao`, { data }),
  aliquotaUf: (codigoUf, data) => get(`${DA}/aliquota-uf`, { codigoUf, data }),
  aliquotaMunicipio: (codigoMunicipio, data) => get(`${DA}/aliquota-municipio`, { codigoMunicipio, data }),
  redutoresCompraGov: () => get(`${DA}/redutores-compra-governamental`, null, { cacheKey: 'redutores' }),
  transferenciasCbs: () => get(`${DA}/transferencias-cbs`, null, { cacheKey: 'transfcbs' }),
  transferenciasIbs: () => get(`${DA}/transferencias-ibs`, null, { cacheKey: 'transfibs' }),
};
