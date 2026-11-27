/** Consulta de CST e cClassTrib (CBS/IBS e IS) por data e DF-e. */
import { api } from '../api.js';
import { $, comCarga, debounce } from '../ui.js';
import { hojeISO, esc } from '../format.js';
import { carregaDfe } from '../catalogo.js';
import { tabela, filtra, erro, kv } from './util.js';

export default async function (el) {
  el.innerHTML = `<div class="card"><h2>CST e cClassTrib</h2><div class="grid g4" style="margin-top:12px">
    <div><label for="c_data">Data de vigência</label><input id="c_data" type="date" value="${hojeISO()}"></div>
    <div><label for="c_tp">Tipo de documento</label><select id="c_tp"><option value="">Todos</option></select></div>
    <div><label for="c_imp">Tributo</label><select id="c_imp"><option value="cbs">CBS/IBS</option><option value="is">Imposto Seletivo</option></select></div>
    <div><label for="c_q">Filtrar</label><input id="c_q" placeholder="código ou descrição"></div></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="c_go" type="button">Consultar</button></div></div>
    <div id="c_res"></div>`;
  const res = $('#c_res', el); let dados = [];
  const dfe = await carregaDfe($('#c_data', el).value);
  $('#c_tp', el).innerHTML += dfe.filter((t) => t.sigla).map((t) => `<option value="${esc(t.sigla)}">${esc(t.modelo)} — ${esc(t.titulo)}</option>`).join('');
  const desenha = () => {
    const rows = filtra(dados, $('#c_q', el).value);
    res.innerHTML = `<div class="card"><h2>${rows.length} situação(ões) tributária(s)</h2>${rows.map((s) => {
      const cls = s.classificacoesTributarias || s.classificacoes || [];
      const t = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'object'));
      return `<details style="margin-top:10px"><summary><b>${esc(s.codigoSituacaoTributaria ?? s.cst ?? s.codigo ?? '')}</b> — ${esc(s.descricaoSituacaoTributaria ?? s.descricao ?? '')} <span class="tag">${cls.length} cClassTrib</span></summary>${kv(t)}${cls.length ? tabela(cls) : ''}</details>`;
    }).join('')}</div>`;
  };
  $('#c_q', el).oninput = debounce(desenha, 200);
  $('#c_go', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    try { const f = $('#c_imp', el).value === 'is' ? api.cstIs : api.cstCbsIbs; ({ data: dados } = await f($('#c_data', el).value, $('#c_tp', el).value)); desenha(); }
    catch (e) { erro(res, e); }
  });
  $('#c_go', el).click();
}
