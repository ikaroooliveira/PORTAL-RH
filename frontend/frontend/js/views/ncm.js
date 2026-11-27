/** Consulta de NCM e NBS (dados abertos), incluindo incidência do IS. */
import { api } from '../api.js';
import { $, comCarga, debounce } from '../ui.js';
import { hojeISO, esc, onlyDigits } from '../format.js';
import { tabela, kv, filtra, erro } from './util.js';

export default async function (el) {
  el.innerHTML = `<div class="card"><h2>NCM e NBS</h2><div class="grid g4" style="margin-top:12px">
    <div><label for="n_tipo">Cadastro</label><select id="n_tipo"><option value="ncm">NCM (produtos)</option><option value="nbs">NBS (serviços)</option></select></div>
    <div><label for="n_data">Data de vigência</label><input id="n_data" type="date" value="${hojeISO()}"></div>
    <div><label for="n_cod">Código exato</label><input id="n_cod" inputmode="numeric" placeholder="ex.: 24021000"></div>
    <div><label for="n_q">Filtrar lista</label><input id="n_q" placeholder="código ou descrição"></div></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="n_um" type="button">Consultar código</button><button class="btn sec" id="n_lista" type="button">Listar vigentes</button></div></div>
    <div id="n_res"></div>`;
  const res = $('#n_res', el); let lista = [];
  const desenha = () => { const rows = filtra(lista, $('#n_q', el).value); res.innerHTML = `<div class="card"><h2>${rows.length} de ${lista.length} registros</h2>${tabela(rows.slice(0, 500))}${rows.length > 500 ? '<div class="hint">Exibindo os 500 primeiros; refine o filtro.</div>' : ''}</div>`; };
  $('#n_q', el).oninput = debounce(desenha, 250);
  $('#n_um', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const t = $('#n_tipo', el).value, c = onlyDigits($('#n_cod', el).value), d = $('#n_data', el).value;
    if (!c) return erro(res, { title: 'Informe o código', detail: 'Digite o NCM ou NBS (somente números).' });
    try {
      const { data } = await api[t](c, d);
      let extra = '';
      if (t === 'nbs') { try { extra = `<h3 style="margin-top:14px">Classificações tributárias aplicáveis</h3>${tabela((await api.classificacoesPorNbs(c, d)).data)}`; } catch { /* opcional */ } }
      res.innerHTML = `<div class="card"><h2>${t.toUpperCase()} ${esc(c)}</h2>${kv(data)}${extra}</div>`;
    } catch (e) { erro(res, e); }
  });
  $('#n_lista', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    try { const t = $('#n_tipo', el).value, d = $('#n_data', el).value; ({ data: lista } = await (t === 'ncm' ? api.ncmVigentes(d) : api.nbsLista(d))); desenha(); }
    catch (e) { erro(res, e); }
  });
}
