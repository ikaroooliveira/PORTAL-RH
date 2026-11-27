/** Geração (a partir do ROC calculado/colado) e validação de XML — sempre via API. */
import { api } from '../api.js';
import { $, comCarga, baixar, stamp, copiar, toast } from '../ui.js';
import { esc } from '../format.js';
import { erro } from './util.js';

const val = (o) => (typeof o === 'string' ? o : o && (o.valor ?? o.codigo ?? o.tipo ?? o.name ?? o.nome ?? o.id ?? Object.values(o)[0]));
const lbl = (o) => (typeof o === 'string' ? o : o && (o.descricao ?? o.titulo ?? o.nome ?? val(o)));
const opts = (l) => (Array.isArray(l) ? l : Object.values(l || {})).map((o) => `<option value="${esc(val(o))}">${esc(val(o))}${lbl(o) !== val(o) ? ' — ' + esc(lbl(o)) : ''}</option>`).join('');

export default async function (el, { store }) {
  el.innerHTML = `<div class="card"><h2>Gerar XML</h2>
    <div class="hint">Cole o JSON de resposta do cálculo (ROC) ou use o último cálculo realizado nesta sessão.</div>
    <div class="grid g2" style="margin-top:12px"><div><label for="x_tg">Tipo de documento</label><select id="x_tg"></select></div></div>
    <label for="x_roc" style="margin-top:10px">ROC (JSON)</label><textarea id="x_roc" rows="8" spellcheck="false" style="width:100%;font-family:monospace"></textarea>
    <div class="actions" style="margin-top:12px"><button class="btn sec" id="x_ult" type="button">Usar último cálculo</button><button class="btn" id="x_gerar" type="button">Gerar XML</button></div><div id="x_gres"></div></div>
    <div class="card"><h2>Validar XML</h2><div class="grid g2" style="margin-top:12px"><div><label for="x_tv">Tipo de documento</label><select id="x_tv"></select></div><div><label for="x_st">Subtipo</label><select id="x_st"></select></div></div>
    <label for="x_xml" style="margin-top:10px">XML</label><textarea id="x_xml" rows="8" spellcheck="false" style="width:100%;font-family:monospace"></textarea>
    <div class="actions" style="margin-top:12px"><input id="x_file" type="file" accept=".xml" style="max-width:260px"><button class="btn" id="x_val" type="button">Validar contra o XSD</button></div><div id="x_vres"></div></div>`;
  const [g, v] = await Promise.all([api.xmlTiposGeracao().catch(() => ({ data: [] })), api.xmlTiposValidacao().catch(() => ({ data: [] }))]);
  $('#x_tg', el).innerHTML = opts(g.data);
  const vd = v.data, tipos = Array.isArray(vd) ? vd : (vd && (vd.tipos || vd.tiposDocumento)) || [];
  const subs = (vd && (vd.subtipos || vd.tiposXml)) || ['GRUPO', 'NOTA'];
  $('#x_tv', el).innerHTML = opts(tipos.length ? tipos : g.data); $('#x_st', el).innerHTML = opts(subs);
  $('#x_ult', el).onclick = () => { if (store.ultimoRoc) $('#x_roc', el).value = JSON.stringify(store.ultimoRoc.roc || store.ultimoRoc, null, 2); else toast('Nenhum cálculo nesta sessão.', 'bad'); };
  $('#x_gerar', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const box = $('#x_gres', el);
    try {
      const { data } = await api.xmlGerar($('#x_roc', el).value, $('#x_tg', el).value);
      box.innerHTML = `<pre class="ext" style="white-space:pre-wrap;max-height:380px;overflow:auto">${esc(data)}</pre><div class="actions"><button class="btn sec sm2" id="x_dl" type="button">Baixar .xml</button><button class="btn sec sm2" id="x_cp" type="button">Copiar</button><button class="btn sec sm2" id="x_pv" type="button">Enviar para validação</button></div>`;
      $('#x_dl', box).onclick = () => baixar(`tributacao-${stamp()}.xml`, data, 'application/xml'); $('#x_cp', box).onclick = () => copiar(data);
      $('#x_pv', box).onclick = () => { $('#x_xml', el).value = data; $('#x_xml', el).scrollIntoView(); };
    } catch (e) { erro(box, e); }
  });
  $('#x_file', el).onchange = async (e) => { const f = e.target.files[0]; if (f) $('#x_xml', el).value = await f.text(); };
  $('#x_val', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const box = $('#x_vres', el);
    try { const { data } = await api.xmlValidar($('#x_xml', el).value, $('#x_tv', el).value, $('#x_st', el).value); box.innerHTML = data === true || data === 'true' ? '<div class="msg">XML válido conforme o XSD.</div>' : `<div class="msg bad">XML inválido: ${esc(JSON.stringify(data))}</div>`; }
    catch (e) { erro(box, e); }
  });
}
