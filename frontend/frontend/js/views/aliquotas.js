/** Alíquotas de referência (União/UF/município) e fundamentações legais. */
import { api } from '../api.js';
import { $, comCarga, debounce } from '../ui.js';
import { hojeISO, esc } from '../format.js';
import { optionsUf, optionsMunicipios, codigoMunicipio } from '../catalogo.js';
import { tabela, kv, filtra, erro } from './util.js';

export default async function (el) {
  el.innerHTML = `<div class="card"><h2>Alíquotas de referência</h2><div class="grid g4" style="margin-top:12px">
    <div><label for="a_data">Data</label><input id="a_data" type="date" value="${hojeISO()}"></div>
    <div><label for="a_uf">UF</label><select id="a_uf"><option value="">Selecione</option></select></div>
    <div><label for="a_mun">Município</label><input id="a_mun" list="a_dl" autocomplete="off" placeholder="nome ou código"><datalist id="a_dl"></datalist></div></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="a_uni" type="button">Alíquota da União (CBS)</button><button class="btn sec" id="a_ufb" type="button">Alíquota da UF (IBS)</button><button class="btn sec" id="a_mb" type="button">Alíquota do município (IBS)</button></div>
    <div id="a_res"></div></div>
    <div class="card"><h2>Fundamentações legais</h2><div class="grid g2" style="margin-top:12px"><div><label for="f_q">Filtrar por cClassTrib, CST ou texto</label><input id="f_q"></div></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="f_go" type="button">Carregar fundamentações</button></div><div id="f_res"></div></div>`;
  const res = $('#a_res', el); let muns = [], fund = [];
  const ufs = (await api.ufs().catch(() => ({ data: [] }))).data; $('#a_uf', el).innerHTML = optionsUf(ufs);
  $('#a_uf', el).onchange = async () => { const uf = $('#a_uf', el).value; muns = uf ? (await api.municipios(uf)).data : []; $('#a_dl', el).innerHTML = optionsMunicipios(muns); };
  const mostra = (t, d) => { res.innerHTML = `<div style="margin-top:12px"><b>${esc(t)}</b>${kv(d)}</div>`; };
  const d = () => $('#a_data', el).value;
  $('#a_uni', el).onclick = (ev) => comCarga(ev.currentTarget, async () => { try { mostra('União', (await api.aliquotaUniao(d())).data); } catch (e) { erro(res, e); } });
  $('#a_ufb', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const u = ufs.find((x) => x.sigla === $('#a_uf', el).value); if (!u) return erro(res, { title: 'Selecione a UF' });
    try { mostra(`UF ${u.sigla}`, (await api.aliquotaUf(u.codigo, d())).data); } catch (e) { erro(res, e); } });
  $('#a_mb', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const c = codigoMunicipio($('#a_mun', el).value, muns); if (!c) return erro(res, { title: 'Selecione a UF e um município válido' });
    try { mostra(`Município ${c}`, (await api.aliquotaMunicipio(c, d())).data); } catch (e) { erro(res, e); } });
  const fr = $('#f_res', el);
  const desenha = () => { const rows = filtra(fund, $('#f_q', el).value); fr.innerHTML = `<div class="hint">${rows.length} de ${fund.length}</div>${tabela(rows.slice(0, 300))}`; };
  $('#f_q', el).oninput = debounce(desenha, 250);
  $('#f_go', el).onclick = (ev) => comCarga(ev.currentTarget, async () => { try { ({ data: fund } = await api.fundamentacoes(d())); desenha(); } catch (e) { erro(fr, e); } });
}
