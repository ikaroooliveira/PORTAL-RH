/**
 * Configuração central do frontend.
 *
 * A URL da API fica SOMENTE aqui. Por padrão é "/api": o server.js deste projeto
 * serve o frontend e repassa /api/* para o backend Java (http://localhost:8080/api),
 * o que evita bloqueio de CORS (o backend não libera origens externas).
 *
 * Para apontar para outro endereço sem editar código, use o botão "API" na barra
 * lateral (fica salvo no navegador) ou defina window.RTC_API_BASE_URL antes dos scripts.
 */
const STORAGE_KEY = 'rtc_api_base_url';
const DEFAULT_API_BASE_URL = '/api';

function readOverride() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export const CONFIG = {
  /** Prefixo do contexto do backend (server.servlet.context-path = /api). */
  get API_BASE_URL() {
    const v = window.RTC_API_BASE_URL || readOverride() || DEFAULT_API_BASE_URL;
    return String(v).replace(/\/+$/, '');
  },
  /** Todos os controllers estão sob "calculadora". */
  API_PREFIX: '/calculadora',
  TIMEOUT_MS: 60000,
  DEFAULT_API_BASE_URL,
  setApiBaseUrl(url) {
    try {
      if (url && url.trim()) localStorage.setItem(STORAGE_KEY, url.trim());
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage indisponível */ }
  },
};
