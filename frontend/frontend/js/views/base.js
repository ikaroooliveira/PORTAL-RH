/** Cálculo de base tributária: 4 endpoints de /base-calculo, enviando somente os campos preenchidos. */
import { api } from '../api.js';
import { $, comCarga, toast, baixar, stamp } from '../ui.js';
import { stringifyPayload, Dec, parseDec, digitsOk } from '../format.js';
import { campo, select, kv, erro, esc } from './util.js';

const COMP = ['vProd','vFrete','vSeg','vOutro','vII','vIS','vDesc','vPIS','vCOFINS','vICMS','vICMSUFDest','vFCP','vFCPUFDest','vICMSMono','vISSQN'];
const CIBS = ['valorBem','ajusteAcrescimos','juros','multas','encargos','frete','impostoSeletivo','outrosTributos','demaisImportancias','icms','iss','pis','pisImportacao','cofins','cofinsImportacao','cosip','ipi','descontoIncondicional'];
const IS = ['valorBem','ajusteAcrescimos','juros','multas','encargos','freteCobrado','outrosTributos','demaisImportancias','icms','iss','cosip','ipi','descontoIncondicional','bonificacao','devolucaoVendas'];
const NFSE = ['vServ','vDescIncond','vISSQN','vPIS','vCOFINS'];
const ano = `<div><label class="req" for="b_ano">Ano do fato gerador</label><input id="b_ano" type="number" min="2026" max="2099" value="2026"></div>`;
const grade = (ids) => `<div class="grid g4" style="margin-top:12px">${ids.map((i) => campo('f_' + i, i)).join('')}</div>`;
const MODOS = {
  unificada: { t: 'Base unificada (NF-e, NFC-e e demais DF-e)', api: 'baseUnificada', html: () => `<div class="grid g2">${ano}${select('b_natureza','Natureza',[['BEM','Bem'],['SERVICO','Serviço']])}<div><label class="req" for="b_tipo">Tipo de documento (modelo)</label><input id="b_tipo" type="number" value="55"></div></div>${grade(COMP)}`,
    build: (r, g) => ({ anoFatoGerador: +$('#b_ano', r).value, tipoDocumento: +$('#b_tipo', r).value, natureza: $('#b_natureza', r).value, componentes: g(COMP) }) },
  nfse: { t: 'Base unificada NFS-e', api: 'baseUnificadaNfse', html: () => `<div class="grid g2">${ano}${select('b_op','Opção Simples Nacional',[['NAO_OPTANTE','Não optante'],['MEI','MEI'],['OPTANTE_ME_EPP','Optante ME/EPP'],['OPTANTE_PENDENTE','Optante pendente']])}${select('b_sit','Situação da operação',[['comum','Comum'],['salaoParceiro','Salão parceiro'],['locacao9903','Locação (9903)']])}${select('b_reg','Regime de apuração IBS/CBS (SN)',[['','Não informado'],['IBS_CBS_PELO_SN','1 — IBS+CBS pelo SN'],['CBS_PELO_SN_IBS_REGULAR','2 — CBS pelo SN + IBS regular'],['AMBOS_REGULARES','3 — Ambos regulares']])}</div>${grade(NFSE)}`,
    build: (r, g) => ({ anoFatoGerador: +$('#b_ano', r).value, opSimpNac: $('#b_op', r).value, situacao: $('#b_sit', r).value, regApIBSCBSSN: $('#b_reg', r).value || undefined, ...g(NFSE) }) },
  is: { t: 'Base do IS — mercadorias', api: 'baseIsMercadorias', html: () => `<div class="grid g2">${ano}</div>${grade(IS)}`, build: (r, g) => ({ anoFatoGerador: +$('#b_ano', r).value, ...g(IS) }) },
  cibs: { t: 'Base de CBS/IBS — mercadorias', api: 'baseCbsIbsMercadorias', html: () => `<div class="grid g2">${ano}</div>${grade(CIBS)}`, build: (r, g) => ({ anoFatoGerador: +$('#b_ano', r).value, ...g(CIBS) }) },
};

export default async function (el) {
  el.innerHTML = `<div class="card"><h2>Cálculo de base tributária</h2>
    <div class="grid g2" style="margin-top:12px">${select('b_modo', 'Tipo de base', Object.entries(MODOS).map(([k, m]) => [k, m.t]))}</div>
    <div id="bForm"></div>
    <div class="actions" style="margin-top:14px"><button class="btn" id="bCalc" type="button">Calcular base</button><button class="btn sec" id="bLimpa" type="button">Limpar</button></div>
    <div class="hint">Campos vazios não são enviados (a API assume zero). Valores em formato brasileiro (1.234,56).</div></div>
    <div id="bRes"></div>`;
  const form = $('#bForm', el), res = $('#bRes', el);
  const monta = () => { form.innerHTML = MODOS[$('#b_modo', el).value].html(); res.innerHTML = ''; };
  $('#b_modo', el).onchange = monta; monta();
  $('#bLimpa', el).onclick = monta;
  $('#bCalc', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    const modo = MODOS[$('#b_modo', el).value];
    const invalido = [];
    const g = (ids) => { const o = {}; for (const i of ids) { const v = parseDec($('#f_' + i, el).value); if (v === null || (v && !digitsOk(v, 13, 2))) invalido.push(i); else if (v) o[i] = new Dec(v); } return o; };
    const body = modo.build(el, g);
    if (invalido.length) return toast(`Valor inválido em: ${invalido.join(', ')}`, 'bad', 6000);
    try {
      const { data } = await api[modo.api](stringifyPayload(body));
      const avisos = data.avisos || [], erros = data.erros || [];
      res.innerHTML = `<div class="card"><h2>Resultado</h2>${kv(Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'avisos' && k !== 'erros')))}
        ${avisos.map((a) => `<div class="msg warn">${esc(a)}</div>`).join('')}${erros.map((x) => `<div class="msg bad">${esc(typeof x === 'string' ? x : JSON.stringify(x))}</div>`).join('')}
        <div class="actions"><button class="btn sec sm2" id="bJson" type="button">Exportar JSON</button></div></div>`;
      $('#bJson', res).onclick = () => baixar(`base-calculo-${stamp()}.json`, JSON.stringify({ entrada: body, resposta: data }, null, 2), 'application/json');
    } catch (e) { erro(res, e); }
  });
}
