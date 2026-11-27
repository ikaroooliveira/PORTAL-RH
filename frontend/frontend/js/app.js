/** Shell da aplicação: navegação lateral, tema, página inicial, status da API e roteamento por hash. */
import { ICONS } from './icons.js';
import { api, onLoading } from './api.js';
import { CONFIG } from './config.js';
import { $, $$, modal, toast } from './ui.js';
import { esc } from './format.js';

/** Estado compartilhado entre telas (ex.: último ROC calculado, usado na tela de XML). */
export const store = { ultimoRoc: null, xmlPrefill: null };

const ROTAS = [
  { id: 'calculo', grupo: 'Cálculos', icon: 'calc', titulo: 'Cálculo de IBS, CBS e IS',
    desc: 'Monte a operação com itens, NCM/NBS, CST e cClassTrib e obtenha CBS, IBS estadual, IBS municipal e IS.',
    dica: 'Informe a operação e os itens; o cálculo é feito pela API da Receita Federal/SERPRO',
    mod: () => import('./views/calculo.js') },
  { id: 'base', grupo: 'Cálculos', icon: 'base', titulo: 'Cálculo de base tributária',
    desc: 'Base de cálculo unificada (NF-e/NFC-e e NFS-e) e bases de mercadorias para IS e CBS/IBS.',
    dica: 'Componentes da base de cálculo, com avisos de vigência retornados pela API',
    mod: () => import('./views/base.js') },
  { id: 'cst', grupo: 'Consultas', icon: 'cst', titulo: 'Consulta de CST e cClassTrib',
    desc: 'Situações tributárias e classificações tributárias vigentes, com detalhes, reduções e fundamentos.',
    dica: 'Consulte por data de vigência e tipo de documento fiscal',
    mod: () => import('./views/cst.js') },
  { id: 'ncm', grupo: 'Consultas', icon: 'ncm', titulo: 'Consulta de NCM e NBS',
    desc: 'Pesquise NCM e NBS vigentes e veja a incidência do Imposto Seletivo e as classificações aplicáveis.',
    dica: 'Busque por código ou descrição',
    mod: () => import('./views/ncm.js') },
  { id: 'aliquotas', grupo: 'Consultas', icon: 'aliq', titulo: 'Alíquotas e fundamentações legais',
    desc: 'Alíquotas de referência da União, UF e município, redutores e fundamentações legais por cClassTrib.',
    dica: 'Alíquotas de referência e base legal das classificações',
    mod: () => import('./views/aliquotas.js') },
  { id: 'xml', grupo: 'Documentos fiscais', icon: 'xml', titulo: 'Geração e validação de XML',
    desc: 'Gere o XML dos grupos de tributação a partir do cálculo e valide XML (grupo ou nota) contra o XSD.',
    dica: 'NF-e, NFC-e, CT-e, BP-e, NF3-e e NFS-e (validação)',
    mod: () => import('./views/xml.js') },
];

const montadas = new Map();

/* ---------- Tema (mesma lógica do Portal RH) ---------- */
let TEMA = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
function aplicaTema(t) {
  TEMA = t === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', TEMA);
  try { localStorage.setItem('tema_v1', TEMA); } catch { /* ignore */ }
  $('#tema').textContent = TEMA === 'dark' ? '☀' : '☾';
  $('#logo').src = TEMA === 'dark' ? 'img/logo-dark.png' : 'img/logo-light.png';
}

/* ---------- Navegação ---------- */
function montaMenu() {
  let html = `<button class="tab" data-t="home">${ICONS.home}Início</button>`;
  let grupo = '';
  for (const r of ROTAS) {
    if (r.grupo !== grupo) { grupo = r.grupo; html += `<div class="grp">${esc(grupo)}</div>`; }
    html += `<button class="tab" data-t="${r.id}">${ICONS[r.icon]}${esc(r.titulo)}</button>`;
  }
  $('#tabs').innerHTML = html;
}

function montaHome() {
  const cards = ROTAS.map((r) =>
    `<button class="opt" data-go="${r.id}"><span class="ico">${ICONS[r.icon]}</span><h3>${esc(r.titulo)}</h3><p>${esc(r.desc)}</p></button>`).join('');
  $('#home').innerHTML = `<div class="sec-t">O que você quer fazer?</div><div class="cards">${cards}</div>
    <div class="sec-t">Sobre as informações</div>
    <div class="card"><div class="ext" style="margin:0;line-height:1.55">Todos os valores são calculados e consultados na API oficial da calculadora da Reforma Tributária do Consumo (LC 214/2025).
    Cálculos feitos com alíquotas informadas pelo usuário ou com dados de teste são sinalizados como <b>simulados</b> nos resultados.
    Confira sempre a versão da API e da base de dados exibida na barra lateral.</div></div>`;
}

async function abre(id) {
  const rota = ROTAS.find((r) => r.id === id);
  const home = !rota;
  document.body.classList.toggle('home', home);
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === (home ? 'home' : id)));
  $('#titulo').textContent = home ? 'Calculadora da Reforma Tributária' : rota.titulo;
  $('#dica').textContent = home ? 'Selecione uma ferramenta para começar' : rota.dica;
  $('#home').style.display = home ? 'block' : 'none';
  $$('#views > section').forEach((s) => { s.style.display = 'none'; s.classList.remove('printing'); });
  document.title = `${home ? 'Calculadora RTC' : rota.titulo} · Opção Contabilidade`;
  window.scrollTo(0, 0);
  if (home) return;

  let sec = montadas.get(id);
  if (!sec) {
    sec = document.createElement('section');
    sec.id = `v-${id}`;
    sec.innerHTML = '<div class="loading-box"><span class="spin"></span> Carregando…</div>';
    $('#views').appendChild(sec);
    montadas.set(id, sec);
    try {
      const m = await rota.mod();
      sec.innerHTML = '';
      await m.default(sec, { store, navegar });
    } catch (e) {
      console.error(e);
      sec.innerHTML = `<div class="card alert bad"><b>Não foi possível carregar esta tela.</b><div class="ext">${esc(e.message)}</div></div>`;
      montadas.delete(id);
    }
  }
  sec.style.display = 'block';
  sec.classList.add('printing');
}

export function navegar(id) { location.hash = id === 'home' ? '' : id; }
const rotaAtual = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?')[0];

/* ---------- Status da API ---------- */
async function verificaApi() {
  const el = $('#apistat');
  try {
    const { data } = await api.versao();
    el.className = 'apistat ok';
    $('#apistatTxt').innerHTML = `API ${esc(data.ambiente || 'online')} · v${esc(data.versaoApp)}<br>Base ${esc(data.versaoDb)} · ${esc(data.dataVersaoDb || '')}`;
    el.title = `${data.descricaoVersaoApp || ''} | ${data.descricaoVersaoDb || ''}`;
  } catch (e) {
    el.className = 'apistat off';
    $('#apistatTxt').textContent = 'API indisponível';
    el.title = e.detail || e.message;
  }
}

function configuraApi() {
  const m = modal('Endereço da API', `
    <label for="apiUrl">URL base da API (contexto /api do backend)</label>
    <input id="apiUrl" value="${esc(CONFIG.API_BASE_URL)}" placeholder="${esc(CONFIG.DEFAULT_API_BASE_URL)}">
    <div class="hint">Padrão <b>${esc(CONFIG.DEFAULT_API_BASE_URL)}</b>: o servidor deste portal (<code>node server.js</code>) repassa as chamadas ao backend Java.
    Se usar um endereço direto (ex.: <code>http://localhost:8080/api</code>), o backend precisa permitir CORS para esta origem.</div>
    <div class="actions"><button class="btn" id="apiSalvar" type="button">Salvar</button>
    <button class="btn sec" id="apiPadrao" type="button">Restaurar padrão</button>
    <button class="btn sec" id="apiTestar" type="button">Testar conexão</button></div>
    <div class="msg" id="apiMsg"></div>`);
  const msg = $('#apiMsg', m.el);
  $('#apiSalvar', m.el).onclick = () => { CONFIG.setApiBaseUrl($('#apiUrl', m.el).value); api.limparCache(); m.fechar(); verificaApi(); toast('Endereço da API salvo.'); };
  $('#apiPadrao', m.el).onclick = () => { CONFIG.setApiBaseUrl(''); api.limparCache(); m.fechar(); verificaApi(); toast('Endereço padrão restaurado.'); };
  $('#apiTestar', m.el).onclick = async () => {
    CONFIG.setApiBaseUrl($('#apiUrl', m.el).value); api.limparCache();
    try { const { data } = await api.versao(); msg.className = 'msg'; msg.textContent = `Conectado: API v${data.versaoApp}, base ${data.versaoDb}.`; verificaApi(); }
    catch (e) { msg.className = 'msg bad'; msg.textContent = `${e.message} ${e.detail || ''}`; }
  };
}

/* ---------- Inicialização ---------- */
function init() {
  $('#menuBtn').innerHTML = ICONS.menu;
  montaMenu();
  montaHome();
  aplicaTema(TEMA);
  $('#tema').onclick = () => aplicaTema(TEMA === 'dark' ? 'light' : 'dark');
  $('#sbApi').onclick = configuraApi;
  $('#logoWrap').onclick = () => navegar('home');
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tab, [data-go]');
    if (!t) return;
    navegar(t.dataset.t || t.dataset.go);
    document.body.classList.remove('nav-open');
  });
  $('#menuBtn').onclick = () => document.body.classList.add('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
  onLoading((n) => $('#progress').classList.toggle('on', n > 0));
  window.addEventListener('hashchange', () => abre(rotaAtual()));
  abre(rotaAtual());
  verificaApi();
}
init();
