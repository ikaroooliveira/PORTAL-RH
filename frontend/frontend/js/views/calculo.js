/** Cálculo de IBS, CBS e IS — POST /regime-geral e POST /observabilidade/regime-geral. */
import { api } from '../api.js';
import { $, $$, modal, toast, debounce, comCarga, erroHtml, baixar, stamp } from '../ui.js';
import { esc, parseDec, digitsOk, Dec, stringifyPayload, novoIdOperacao, hojeISO, brl } from '../format.js';
import { carregaCst, carregaDfe, optionsUf, optionsMunicipios, codigoMunicipio, descCst, descClass } from '../catalogo.js';
import { renderResultado, exportarCsv, exportarJson } from '../resultado.js';

const ENTES = [[1, 'União'], [2, 'Estado'], [3, 'Distrito Federal'], [4, 'Município'], [5, 'Consórcio Público'], [6, 'Comitê Gestor do IBS']];
const OPERS = [[1, 'Fornecimento com pagamento posterior'], [2, 'Recebimento do pagamento com fornecimento já realizado'], [3, 'Fornecimento com pagamento já realizado'], [4, 'Recebimento do pagamento com fornecimento posterior'], [5, 'Fornecimento e recebimento do pagamento concomitantes']];
const FUSOS = ['-03:00', '-02:00', '-04:00', '-05:00', 'Z'];
/** Componentes da base de cálculo (ComponentesBaseCalculoInput). */
const COMPONENTES = [
  ['vProd', 'Valor dos produtos/serviços (vProd)'], ['vFrete', 'Frete (vFrete)'], ['vSeg', 'Seguro (vSeg)'], ['vOutro', 'Outras despesas (vOutro)'],
  ['vII', 'Imposto de importação (vII)'], ['vIS', 'Imposto Seletivo (vIS)'], ['vDesc', 'Desconto incondicional (vDesc)'],
  ['vPIS', 'PIS (vPIS)'], ['vCOFINS', 'COFINS (vCOFINS)'], ['vICMS', 'ICMS (vICMS)'], ['vICMSUFDest', 'ICMS UF destino (vICMSUFDest)'],
  ['vFCP', 'FCP (vFCP)'], ['vFCPUFDest', 'FCP UF destino (vFCPUFDest)'], ['vICMSMono', 'ICMS monofásico (vICMSMono)'], ['vISSQN', 'ISSQN (vISSQN)'],
];

let uidSeq = 0;
const novoItem = (numero) => ({
  uid: ++uidSeq, numero, tipo: 'ncm', ncm: '', nbs: '', cst: '', cClassTrib: '', baseCalculo: '', quantidade: '', unidade: '',
  an: { cbs: '', ibsEstadual: '', ibsMunicipal: '', adValorem: '', adRem: '' },
  isOn: false, is: { cst: '', cClassTrib: '', baseCalculo: '', quantidade: '', unidade: '', impostoInformado: '' },
  regOn: false, reg: { cst: '', cClassTrib: '' },
  bcOn: false, bc: Object.fromEntries(COMPONENTES.map(([k]) => [k, ''])),
  aberto: true,
});
const clone = (o) => JSON.parse(JSON.stringify(o));
const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? '' : a[k]), o) ?? '';
const setp = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

export default async function mount(el, ctx) {
  const hoje = hojeISO();
  const S = {
    op: { id: novoIdOperacao(), versao: '1.0.0', data: hoje, hora: '12:00', fuso: '-03:00', uf: '', municipio: '', tpDoc: '', govOn: false, tpEnteGov: '', tpOperGov: '' },
    itens: [novoItem(1)], modo: 'obs', cat: { cbs: [], is: [] }, dfe: [], ufs: [], munis: [], resultado: null,
  };
  const ano = () => Number((S.op.data || hoje).slice(0, 4));
  const exige2027 = () => ano() >= 2027;

  el.innerHTML = `
  <div class="card" id="cOp">
    <div class="sel"><div><h2>Identificação da operação</h2><div class="ext">Dados do ROC (representação da operação de consumo) e do fato gerador.</div></div><span class="tag" id="tagAno"></span></div>
    <div class="grid g2" style="margin-top:12px">
      <div><label class="req" for="opId">Identificador do ROC (id)</label><div class="inline"><input id="opId" data-op="id" maxlength="64"><button class="btn sec sm2" type="button" id="novoId">Gerar novo</button></div></div>
      <div><label class="req" for="opVersao">Versão do ROC</label><input id="opVersao" data-op="versao" placeholder="1.0.0"></div>
      <div><label class="req" for="opData">Data do fato gerador</label><input id="opData" type="date" data-op="data"></div>
      <div><label for="opHora">Hora</label><input id="opHora" type="time" data-op="hora"></div>
      <div><label for="opFuso">Fuso (offset)</label><select id="opFuso" data-op="fuso">${FUSOS.map((f) => `<option>${f}</option>`).join('')}</select></div>
      <div><label for="opUf">UF</label><select id="opUf" data-op="uf"><option value="">Carregando…</option></select></div>
      <div><label class="req" for="opMun">Município (IBGE)</label><input id="opMun" data-op="municipio" list="dlMun" placeholder="Digite o nome ou o código" autocomplete="off"><datalist id="dlMun"></datalist><div class="hint" id="munHint">Selecione a UF para listar os municípios.</div></div>
      <div><label for="opTp">Tipo de documento (tpDoc)</label><select id="opTp" data-op="tpDoc"><option value="">Não informado</option></select><div class="hint">Opcional. Define o catálogo de CST/cClassTrib exibido.</div></div>
    </div>
    <div class="opc off" id="opcGov"><label class="opc-h"><input type="checkbox" id="govOn"> Compra governamental (gCompraGov)</label>
      <div class="opc-b grid g2">
        <div><label class="req" for="tpEnte">Tipo de ente governamental</label><select id="tpEnte" data-op="tpEnteGov"><option value="">Selecione</option>${ENTES.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join('')}</select></div>
        <div><label for="tpOper">Tipo de operação governamental</label><select id="tpOper" data-op="tpOperGov"><option value="">Não informado</option>${OPERS.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join('')}</select></div>
      </div></div>
    <datalist id="dlCst"></datalist><datalist id="dlCstIs"></datalist>
    <div class="msg warn" id="catNote"></div>
  </div>

  <div class="toolbar"><div class="sec-t" style="margin:0" id="itensTit">Itens da operação</div>
    <div class="actions"><button class="btn sm2" id="addItem" type="button">+ Adicionar item</button>
      <button class="btn sec sm2" id="toggleAll" type="button">Recolher todos</button>
      <label class="btn sec sm2" style="margin:0;cursor:pointer">Importar JSON<input type="file" id="impJson" accept=".json,application/json" hidden></label></div></div>
  <div id="itens"></div>

  <div class="card">
    <div class="sel"><div><h2>Cálculo</h2><div class="ext">Escolha como a API deve tratar inconsistências nos itens.</div></div>
      <div class="seg" role="group" aria-label="Modo de cálculo"><button type="button" data-modo="obs" class="on">Com observabilidade</button><button type="button" data-modo="strict">Estrito (regime-geral)</button></div></div>
    <div class="hint" id="modoHint" style="margin-top:8px"></div>
    <div id="valBox"></div>
    <div class="actions"><button class="btn" id="calcular" type="button">Calcular tributos</button>
      <button class="btn sec" id="limpar" type="button">Limpar operação</button>
      <button class="btn sec" id="expReq" type="button">Exportar requisição (JSON)</button></div>
    <details class="mem" id="jsonDet"><summary>Ver JSON enviado à API</summary><pre id="jsonPrev"></pre></details>
  </div>
  <div id="resultado"></div>`;

  const itensEl = $('#itens', el);
  const hintModo = () => {
    $('#modoHint', el).textContent = S.modo === 'obs'
      ? 'POST /observabilidade/regime-geral — itens com erro são reportados individualmente e os demais são calculados.'
      : 'POST /regime-geral — a operação inteira é rejeitada (HTTP 422) no primeiro erro. Necessário para gerar XML.';
  };

  /* ---------- operação: bind ---------- */
  function syncOpToDom() {
    $$('[data-op]', el).forEach((i) => { i.value = S.op[i.dataset.op] ?? ''; });
    $('#govOn', el).checked = S.op.govOn;
    $('#opcGov', el).classList.toggle('off', !S.op.govOn);
    $('#tagAno', el).textContent = exige2027() ? 'Alíquotas nominais obrigatórias (≥ 2027)' : 'Alíquotas pela base da API (< 2027)';
    hintModo();
  }

  el.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.op;
    if (!k) return;
    S.op[k] = e.target.value;
    e.target.classList.remove('f-err');
  });
  el.addEventListener('change', async (e) => {
    const k = e.target.dataset && e.target.dataset.op;
    if (k === 'uf') await carregaMunicipios();
    if (k === 'data') { syncOpToDom(); renderItens(); recarregaCatalogo(); }
    if (k === 'tpDoc') recarregaCatalogo();
  });
  $('#govOn', el).onchange = (e) => { S.op.govOn = e.target.checked; $('#opcGov', el).classList.toggle('off', !S.op.govOn); };
  $('#novoId', el).onclick = () => { S.op.id = novoIdOperacao(); $('#opId', el).value = S.op.id; };

  async function carregaMunicipios() {
    S.op.municipio = ''; $('#opMun', el).value = ''; S.munis = [];
    $('#dlMun', el).innerHTML = '';
    if (!S.op.uf) { $('#munHint', el).textContent = 'Selecione a UF para listar os municípios.'; return; }
    $('#munHint', el).textContent = 'Carregando municípios…';
    try {
      const { data } = await api.municipios(S.op.uf);
      S.munis = data || [];
      $('#dlMun', el).innerHTML = optionsMunicipios(S.munis);
      $('#munHint', el).textContent = `${S.munis.length} municípios de ${S.op.uf}. Você também pode digitar o código IBGE.`;
    } catch (err) { $('#munHint', el).textContent = `Não foi possível listar municípios: ${err.message}. Digite o código IBGE.`; }
  }

  const siglaDfeAtual = () => {
    if (!S.op.tpDoc) return '';
    const t = S.dfe.find((x) => String(x.modelo) === String(S.op.tpDoc) && x.suportado !== false);
    return t ? t.codigo : '';
  };
  const recarregaCatalogo = debounce(async () => {
    const cat = await carregaCst(S.op.data || hoje, siglaDfeAtual());
    S.cat = cat;
    const opts = (l) => l.map((s) => `<option value="${esc(s.codigo)}" label="${esc(s.descricao)}"></option>`).join('');
    $('#dlCst', el).innerHTML = opts(cat.cbs);
    $('#dlCstIs', el).innerHTML = opts(cat.is);
    const notas = [];
    if (cat.erroCbs) notas.push(`CST/cClassTrib (CBS/IBS) indisponíveis: ${cat.erroCbs.detail || cat.erroCbs.message}`);
    if (cat.erroIs) notas.push(`CST/cClassTrib do IS indisponíveis: ${cat.erroIs.detail || cat.erroIs.message}`);
    $('#catNote', el).textContent = notas.join(' · ');
    $$('.item-card', itensEl).forEach(atualizaDicas);
  }, 350);

  /* ---------- itens ---------- */
  const campo = (it, label, path, o = {}) => {
    const v = getp(it, path);
    return `<div><label class="${o.req ? 'req' : ''}">${label}</label><input data-k="${path}" value="${esc(v)}" ${o.list ? `list="${o.list}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} inputmode="${o.mode || 'decimal'}" autocomplete="off">${o.hint ? `<div class="hint" ${o.hintId ? `data-hint="${o.hintId}"` : ''}>${o.hint}</div>` : (o.hintId ? `<div class="hint" data-hint="${o.hintId}"></div>` : '')}</div>`;
  };
  const opc = (it, flag, titulo, corpo) => `<div class="opc ${it[flag] ? '' : 'off'}"><label class="opc-h"><input type="checkbox" data-tog="${flag}" ${it[flag] ? 'checked' : ''}> ${titulo}</label><div class="opc-b">${corpo}</div></div>`;

  function resumo(it) {
    const id = [it.ncm && `NCM ${it.ncm}`, it.nbs && `NBS ${it.nbs}`].filter(Boolean).join(' · ');
    const cl = it.cst || it.cClassTrib ? `CST ${it.cst || '—'} / ${it.cClassTrib || '—'}` : '';
    const bc = parseDec(it.baseCalculo);
    return [id, cl, bc ? brl(bc) : ''].filter(Boolean).join(' · ') || 'Preencha os dados do item';
  }

  function itemHtml(it, idx) {
    const mostraNcm = it.tipo !== 'nbs', mostraNbs = it.tipo !== 'ncm';
    const an = exige2027() ? `<div class="grid g4" style="margin-top:12px"><div class="full" style="grid-column:1/-1"><b style="font-size:13px">Alíquotas nominais (%)</b> <span class="mini">obrigatórias a partir de 2027</span></div>
      ${campo(it, 'CBS', 'an.cbs', { req: 1, ph: '0,00' })}${campo(it, 'IBS estadual', 'an.ibsEstadual', { req: 1, ph: '0,00' })}${campo(it, 'IBS municipal', 'an.ibsMunicipal', { req: 1, ph: '0,00' })}</div>` : '';
    const isAl = exige2027() ? `${campo(it, 'IS ad valorem (%)', 'an.adValorem', { ph: '0,00' })}${campo(it, 'IS ad rem (por unidade)', 'an.adRem', { ph: '0,00' })}` : '';
    return `<div class="card item-card ${it.aberto ? '' : 'fechado'}" data-uid="${it.uid}">
      <div class="item-head" data-act="toggle"><b>Item <span data-r="num">${esc(it.numero)}</span></b><span class="res" data-r="res">${esc(resumo(it))}</span>
        <div class="item-tools"><button class="btn sec sm2" type="button" data-act="dup" title="Duplicar item">Duplicar</button><button class="btn danger sm2" type="button" data-act="del" title="Remover item">Remover</button></div></div>
      <div class="item-body">
        <div class="grid g4">
          ${campo(it, 'Nº do item', 'numero', { req: 1, mode: 'numeric' })}
          <div><label>Natureza</label><select data-k="tipo"><option value="ncm" ${it.tipo === 'ncm' ? 'selected' : ''}>Mercadoria (NCM)</option><option value="nbs" ${it.tipo === 'nbs' ? 'selected' : ''}>Serviço (NBS)</option><option value="ambos" ${it.tipo === 'ambos' ? 'selected' : ''}>NCM e NBS</option></select></div>
          ${mostraNcm ? `<div><label>NCM</label><div class="inline"><input data-k="ncm" value="${esc(it.ncm)}" maxlength="8" inputmode="numeric" placeholder="8 dígitos"><button class="btn sec sm2" type="button" data-act="pick-ncm">Buscar</button></div></div>` : ''}
          ${mostraNbs ? `<div><label>NBS</label><div class="inline"><input data-k="nbs" value="${esc(it.nbs)}" maxlength="9" inputmode="numeric" placeholder="9 dígitos"><button class="btn sec sm2" type="button" data-act="pick-nbs">Buscar</button></div></div>` : ''}
        </div>
        <div class="grid g2" style="margin-top:12px">
          <div><label class="req">CST (IBS/CBS)</label><input data-k="cst" value="${esc(it.cst)}" list="dlCst" maxlength="3" inputmode="numeric" placeholder="000" autocomplete="off"><div class="hint" data-hint="cst"></div></div>
          <div><label class="req">cClassTrib</label><div class="inline"><input data-k="cClassTrib" value="${esc(it.cClassTrib)}" list="dlCc${it.uid}" maxlength="6" inputmode="numeric" placeholder="000001" autocomplete="off"><button class="btn sec sm2" type="button" data-act="pick-class:main">Escolher</button></div><datalist id="dlCc${it.uid}"></datalist><div class="hint" data-hint="cc"></div></div>
        </div>
        <div class="grid g4" style="margin-top:12px">
          ${campo(it, 'Base de cálculo (R$)', 'baseCalculo', { ph: '0,00' })}
          ${campo(it, 'Quantidade', 'quantidade', { ph: '0' })}
          ${campo(it, 'Unidade', 'unidade', { ph: 'UN, KG, LT…', mode: 'text', max: 6 })}
        </div>
        ${an}
        ${opc(it, 'isOn', 'Imposto Seletivo (impostoSeletivo)', `<div class="grid g4">
            <div><label class="req">CST do IS</label><input data-k="is.cst" value="${esc(it.is.cst)}" list="dlCstIs" maxlength="3" inputmode="numeric" placeholder="000"></div>
            <div><label class="req">cClassTrib do IS</label><div class="inline"><input data-k="is.cClassTrib" value="${esc(it.is.cClassTrib)}" list="dlCcIs${it.uid}" maxlength="6" inputmode="numeric" placeholder="000000"><button class="btn sec sm2" type="button" data-act="pick-class:is">Escolher</button></div><datalist id="dlCcIs${it.uid}"></datalist></div>
            ${campo(it, 'Base de cálculo do IS (R$)', 'is.baseCalculo', { req: 1, ph: '0,00' })}
            ${campo(it, 'Quantidade', 'is.quantidade', { ph: '0' })}
            ${campo(it, 'Unidade', 'is.unidade', { ph: 'LT', mode: 'text', max: 6 })}
            ${campo(it, 'Imposto informado (R$)', 'is.impostoInformado', { ph: '0,00', hint: 'Opcional' })}
            ${isAl}</div><div class="hint" data-hint="isdesc"></div>`)}
        ${opc(it, 'regOn', 'Tributação regular (tributacaoRegular)', `<div class="grid g2">
            <div><label class="req">CST</label><input data-k="reg.cst" value="${esc(it.reg.cst)}" list="dlCst" maxlength="3" inputmode="numeric" placeholder="000"></div>
            <div><label class="req">cClassTrib</label><div class="inline"><input data-k="reg.cClassTrib" value="${esc(it.reg.cClassTrib)}" list="dlCcReg${it.uid}" maxlength="6" inputmode="numeric" placeholder="000001"><button class="btn sec sm2" type="button" data-act="pick-class:reg">Escolher</button></div><datalist id="dlCcReg${it.uid}"></datalist></div></div>`)}
        ${opc(it, 'bcOn', 'Componentes da base de cálculo (gComponentesBC)', `<div class="hint" style="margin:0 0 10px">A API calcula ou valida a base a partir dos componentes. Informe apenas os que se aplicam.</div><div class="grid g4">${COMPONENTES.map(([k, n]) => campo(it, n, `bc.${k}`, { ph: '0,00' })).join('')}</div>`)}
      </div></div>`;
  }

  function dlOptions(lista, cst) {
    const s = lista.find((x) => x.codigo === cst);
    return s ? (s.classificacoesTributarias || []).map((c) => `<option value="${esc(c.codigo)}" label="${esc(c.descricao)}"></option>`).join('') : '';
  }
  function atualizaDicas(card) {
    const it = S.itens.find((x) => x.uid === Number(card.dataset.uid)); if (!it) return;
    $(`#dlCc${it.uid}`, card).innerHTML = dlOptions(S.cat.cbs, it.cst);
    const dIs = $(`#dlCcIs${it.uid}`, card); if (dIs) dIs.innerHTML = dlOptions(S.cat.is, it.is.cst);
    const dR = $(`#dlCcReg${it.uid}`, card); if (dR) dR.innerHTML = dlOptions(S.cat.cbs, it.reg.cst);
    const set = (k, t) => { const h = $(`[data-hint="${k}"]`, card); if (h) h.textContent = t; };
    set('cst', descCst(S.cat.cbs, it.cst));
    set('cc', descClass(S.cat.cbs, it.cst, it.cClassTrib));
    set('isdesc', [descClass(S.cat.is, it.is.cst, it.is.cClassTrib)].filter(Boolean).join(''));
    const r = $('[data-r="res"]', card); if (r) r.textContent = resumo(it);
  }

  function renderItens() {
    itensEl.innerHTML = S.itens.map(itemHtml).join('') || '<div class="card ph">Nenhum item. Clique em “Adicionar item”.</div>';
    $$('.item-card', itensEl).forEach(atualizaDicas);
    $('#itensTit', el).textContent = `Itens da operação (${S.itens.length})`;
  }
  function renderUm(uid) {
    const it = S.itens.find((x) => x.uid === uid); const card = $(`.item-card[data-uid="${uid}"]`, itensEl);
    if (!it || !card) return renderItens();
    card.outerHTML = itemHtml(it);
    atualizaDicas($(`.item-card[data-uid="${uid}"]`, itensEl));
  }
  const proxNumero = () => S.itens.reduce((m, i) => Math.max(m, Number(i.numero) || 0), 0) + 1;

  itensEl.addEventListener('input', (e) => {
    const card = e.target.closest('.item-card'); const k = e.target.dataset.k; if (!card || !k) return;
    const it = S.itens.find((x) => x.uid === Number(card.dataset.uid));
    setp(it, k, e.target.value); e.target.classList.remove('f-err');
    if (['cst', 'cClassTrib', 'is.cst', 'is.cClassTrib', 'reg.cst', 'reg.cClassTrib', 'ncm', 'nbs', 'baseCalculo'].includes(k)) atualizaDicas(card);
  });
  itensEl.addEventListener('change', (e) => {
    const card = e.target.closest('.item-card'); if (!card) return;
    const it = S.itens.find((x) => x.uid === Number(card.dataset.uid));
    if (e.target.dataset.tog) { it[e.target.dataset.tog] = e.target.checked; renderUm(it.uid); }
    else if (e.target.dataset.k === 'tipo') { it.tipo = e.target.value; renderUm(it.uid); }
  });
  itensEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.item-card'); const it = S.itens.find((x) => x.uid === Number(card.dataset.uid));
    const act = b.dataset.act;
    if (act === 'toggle') { if (e.target.closest('.item-tools')) return; it.aberto = !it.aberto; card.classList.toggle('fechado', !it.aberto); }
    else if (act === 'dup') { e.stopPropagation(); const c = clone(it); c.uid = ++uidSeq; c.numero = proxNumero(); c.aberto = true; S.itens.splice(S.itens.indexOf(it) + 1, 0, c); renderItens(); toast(`Item duplicado como nº ${c.numero}.`); }
    else if (act === 'del') {
      e.stopPropagation();
      if (S.itens.length === 1) { toast('A operação precisa de ao menos um item.', 'warn'); return; }
      S.itens.splice(S.itens.indexOf(it), 1); renderItens(); toast('Item removido.');
    }
    else if (act === 'pick-ncm') pickCodigo(it, 'ncm');
    else if (act === 'pick-nbs') pickCodigo(it, 'nbs');
    else if (act.startsWith('pick-class')) pickClass(it, act.split(':')[1]);
  });

  $('#addItem', el).onclick = () => { S.itens.push(novoItem(proxNumero())); renderItens(); const c = itensEl.lastElementChild; c && c.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('#toggleAll', el).onclick = (e) => {
    const abrir = S.itens.some((i) => !i.aberto);
    S.itens.forEach((i) => { i.aberto = abrir; }); renderItens();
    e.target.textContent = abrir ? 'Recolher todos' : 'Expandir todos';
  };

  /* ---------- seletores (modais) ---------- */
  async function pickCodigo(it, tipo) {
    const m = modal(tipo === 'ncm' ? 'Buscar NCM vigente' : 'Buscar NBS', `<input type="search" id="q" placeholder="Código ou descrição" autofocus style="width:100%"><div class="hint" id="qInfo">Carregando…</div><div class="scroll" id="qRes" style="max-height:50vh;margin-top:8px"></div>`, { largo: true });
    let lista = [];
    try {
      const r = tipo === 'ncm' ? await api.ncmVigentes(S.op.data || hoje) : await api.nbsLista(S.op.data || hoje);
      lista = (r.data || []).map((x) => ({ c: x.ncm || x.codigo, d: x.descricao }));
    } catch (err) { $('#qInfo', m.el).textContent = `${err.message} ${err.detail || ''}`; return; }
    const draw = () => {
      const q = $('#q', m.el).value.trim().toLowerCase();
      const f = (q ? lista.filter((x) => `${x.c} ${x.d}`.toLowerCase().includes(q)) : lista).slice(0, 100);
      $('#qInfo', m.el).textContent = `${f.length} exibidos de ${lista.length} vigentes em ${S.op.data}`;
      $('#qRes', m.el).innerHTML = f.map((x) => `<div class="card item" data-c="${esc(x.c)}"><div><b>${esc(x.c)}</b><small>${esc(x.d)}</small></div></div>`).join('') || '<div class="ph">Nada encontrado.</div>';
    };
    $('#q', m.el).oninput = debounce(draw, 200); draw();
    $('#qRes', m.el).onclick = (e) => { const c = e.target.closest('[data-c]'); if (!c) return; it[tipo] = c.dataset.c; m.fechar(); renderUm(it.uid); };
  }

  function pickClass(it, alvo) {
    const lista = alvo === 'is' ? S.cat.is : S.cat.cbs;
    const m = modal(alvo === 'is' ? 'Escolher CST/cClassTrib do Imposto Seletivo' : 'Escolher CST e cClassTrib', `<input type="search" id="q" placeholder="Código ou descrição" style="width:100%"><div class="hint" id="qInfo"></div><div class="scroll" id="qRes" style="max-height:55vh;margin-top:8px"></div>`, { largo: true });
    const draw = () => {
      const q = $('#q', m.el).value.trim().toLowerCase();
      const html = lista.map((s) => {
        const cs = (s.classificacoesTributarias || []).filter((c) => !q || `${s.codigo} ${s.descricao} ${c.codigo} ${c.descricao}`.toLowerCase().includes(q));
        if (!cs.length) return '';
        return `<div class="card"><b>CST ${esc(s.codigo)}</b> <span class="mini">${esc(s.descricao)}</span>${cs.slice(0, 200).map((c) => `<div class="err-item cardlink" data-s="${esc(s.codigo)}" data-c="${esc(c.codigo)}"><b>${esc(c.codigo)}</b> — ${esc(c.descricao)}</div>`).join('')}</div>`;
      }).join('');
      $('#qInfo', m.el).textContent = lista.length ? '' : 'Catálogo indisponível para a data/tipo selecionados. Digite os códigos manualmente.';
      $('#qRes', m.el).innerHTML = html || '<div class="ph">Nada encontrado.</div>';
    };
    $('#q', m.el).oninput = debounce(draw, 200); draw();
    $('#qRes', m.el).onclick = (e) => {
      const c = e.target.closest('[data-c]'); if (!c) return;
      const dst = alvo === 'main' ? it : alvo === 'is' ? it.is : it.reg;
      dst.cst = c.dataset.s; dst.cClassTrib = c.dataset.c; m.fechar(); renderUm(it.uid);
    };
  }

  /* ---------- montagem e validação do payload ---------- */
  function montaPayload() {
    const erros = [];
    const E = (msg, uid, k) => erros.push({ msg, uid, k });
    const o = S.op;
    const dec = (v, { uid, k, rot, maxInt = 13, maxFrac = 2, max, req }) => {
      const t = String(v ?? '').trim();
      if (t === '') { if (req) E(`${rot}: obrigatório.`, uid, k); return undefined; }
      const d = parseDec(t);
      if (d === null) { E(`${rot}: valor numérico inválido.`, uid, k); return undefined; }
      if (!digitsOk(d, maxInt, maxFrac)) { E(`${rot}: máximo de ${maxInt} dígitos inteiros e ${maxFrac} decimais.`, uid, k); return undefined; }
      if (max !== undefined && Number(d) > max) { E(`${rot}: não pode ser maior que ${max}.`, uid, k); return undefined; }
      return new Dec(d);
    };
    const p = { id: o.id.trim(), versao: o.versao.trim() };
    if (!p.id) E('Identificador do ROC é obrigatório.', null, 'id');
    if (!p.versao) E('Versão do ROC é obrigatória.', null, 'versao');
    if (!o.data) E('Data do fato gerador é obrigatória.', null, 'data');
    else p.dhFatoGerador = `${o.data}T${o.hora || '00:00'}:00${o.fuso}`;
    const mun = codigoMunicipio(o.municipio, S.munis);
    if (mun === null || mun === undefined) E('Município: selecione um da lista ou informe o código IBGE (7 dígitos).', null, 'municipio');
    else if (mun < 0 || mun > 9999999) E('Município: código inválido.', null, 'municipio');
    else p.municipio = mun;
    if (o.uf) p.uf = o.uf;
    if (o.tpDoc) p.tpDoc = Number(o.tpDoc);
    if (o.govOn) {
      if (!o.tpEnteGov) E('Compra governamental: informe o tipo de ente.', null, 'tpEnteGov');
      p.gCompraGov = { tpEnteGov: Number(o.tpEnteGov) };
      if (o.tpOperGov) p.gCompraGov.tpOperGov = Number(o.tpOperGov);
    }
    const nums = new Map();
    p.itens = S.itens.map((it) => {
      const u = it.uid; const x = {};
      const n = Number(it.numero);
      if (!Number.isInteger(n) || n < 1 || n > 9999999) E(`Item ${it.numero || '?'}: número deve ser inteiro entre 1 e 9999999.`, u, 'numero');
      else if (nums.has(n)) E(`Item ${n}: número duplicado (itens ${nums.get(n)} e ${n}).`, u, 'numero');
      else nums.set(n, n);
      x.numero = n;
      const R = `Item ${it.numero}`;
      if (it.tipo !== 'nbs' && it.ncm.trim()) { if (!/^(\d{8}|00)$/.test(it.ncm.trim())) E(`${R}: NCM deve ter 8 dígitos.`, u, 'ncm'); else x.ncm = it.ncm.trim(); }
      if (it.tipo !== 'ncm' && it.nbs.trim()) { if (!/^\d{9}$/.test(it.nbs.trim())) E(`${R}: NBS deve ter 9 dígitos.`, u, 'nbs'); else x.nbs = it.nbs.trim(); }
      if (it.tipo === 'ncm' && !it.ncm.trim()) E(`${R}: informe o NCM (ou altere a natureza do item).`, u, 'ncm');
      if (it.tipo === 'nbs' && !it.nbs.trim()) E(`${R}: informe a NBS (ou altere a natureza do item).`, u, 'nbs');
      if (!/^\d{3}$/.test(it.cst)) E(`${R}: CST deve ter 3 dígitos.`, u, 'cst'); else x.cst = it.cst;
      if (!/^\d{6}$/.test(it.cClassTrib)) E(`${R}: cClassTrib deve ter 6 dígitos.`, u, 'cClassTrib'); else x.cClassTrib = it.cClassTrib;
      const bcReq = !it.isOn && !it.bcOn;
      const bc = dec(it.baseCalculo, { uid: u, k: 'baseCalculo', rot: `${R}: base de cálculo`, req: bcReq });
      if (bc) x.baseCalculo = bc;
      const q = dec(it.quantidade, { uid: u, k: 'quantidade', rot: `${R}: quantidade`, maxInt: 11, maxFrac: 4 });
      if (q) x.quantidade = q;
      if (it.unidade.trim()) x.unidade = it.unidade.trim();
      if (it.isOn) {
        const i = it.is; const g = {};
        if (!/^\d{3}$/.test(i.cst)) E(`${R} (IS): CST deve ter 3 dígitos.`, u, 'is.cst'); else g.cst = i.cst;
        if (!/^\d{6}$/.test(i.cClassTrib)) E(`${R} (IS): cClassTrib deve ter 6 dígitos.`, u, 'is.cClassTrib'); else g.cClassTrib = i.cClassTrib;
        const b = dec(i.baseCalculo, { uid: u, k: 'is.baseCalculo', rot: `${R} (IS): base de cálculo`, req: true }); if (b) g.baseCalculo = b;
        const iq = dec(i.quantidade, { uid: u, k: 'is.quantidade', rot: `${R} (IS): quantidade`, maxInt: 11, maxFrac: 4 }); if (iq) g.quantidade = iq;
        if (i.unidade.trim()) g.unidade = i.unidade.trim();
        const ii = dec(i.impostoInformado, { uid: u, k: 'is.impostoInformado', rot: `${R} (IS): imposto informado` }); if (ii) g.impostoSeletivo = undefined, g.impostoInformado = ii;
        x.impostoSeletivo = g;
      }
      if (it.regOn) {
        const g = {};
        if (!/^\d{3}$/.test(it.reg.cst)) E(`${R} (tributação regular): CST deve ter 3 dígitos.`, u, 'reg.cst'); else g.cst = it.reg.cst;
        if (!/^\d{6}$/.test(it.reg.cClassTrib)) E(`${R} (tributação regular): cClassTrib deve ter 6 dígitos.`, u, 'reg.cClassTrib'); else g.cClassTrib = it.reg.cClassTrib;
        x.tributacaoRegular = g;
      }
      if (it.bcOn) {
        const g = {};
        for (const [k, nome] of COMPONENTES) { const d = dec(it.bc[k], { uid: u, k: `bc.${k}`, rot: `${R}: ${nome}` }); if (d) g[k] = d; }
        if (!Object.keys(g).length) E(`${R}: informe ao menos um componente da base de cálculo ou desative o grupo.`, u, 'bc.vProd');
        x.gComponentesBC = g;
      }
      if (exige2027()) {
        const a = it.an; const g = {};
        const lim = { maxInt: 3, maxFrac: 4, max: 100 };
        for (const [k, rot, campoApi] of [['cbs', 'CBS', 'cbs'], ['ibsEstadual', 'IBS estadual', 'ibsEstadual'], ['ibsMunicipal', 'IBS municipal', 'ibsMunicipal']]) {
          const d = dec(a[k], { uid: u, k: `an.${k}`, rot: `${R}: alíquota ${rot}`, req: true, ...lim }); if (d) g[campoApi] = d;
        }
        if (it.isOn) {
          const gi = {};
          const av = dec(a.adValorem, { uid: u, k: 'an.adValorem', rot: `${R}: IS ad valorem`, ...lim }); if (av) gi.adValorem = av;
          const ar = dec(a.adRem, { uid: u, k: 'an.adRem', rot: `${R}: IS ad rem`, maxInt: 13, maxFrac: 4 }); if (ar) gi.adRem = ar;
          if (Object.keys(gi).length) g.impostoSeletivo = gi;
        }
        x.aliquotasNominais = g;
      }
      return x;
    });
    return { payload: p, erros };
  }

  function mostraErros(erros) {
    $$('.f-err', el).forEach((i) => i.classList.remove('f-err'));
    $('#valBox', el).innerHTML = `<div class="card alert bad" role="alert"><b>Corrija ${erros.length} ponto(s) antes de calcular</b><ul>${erros.map((e) => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>`;
    for (const e of erros) {
      let inp;
      if (e.uid) { const card = $(`.item-card[data-uid="${e.uid}"]`, itensEl); if (card) { card.classList.remove('fechado'); const it = S.itens.find((x) => x.uid === e.uid); it.aberto = true; inp = $(`[data-k="${e.k}"]`, card); } }
      else inp = $(`[data-op="${e.k}"]`, el);
      if (inp) inp.classList.add('f-err');
    }
    const first = $('.f-err', el); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const corpoJson = (payload, indent) => stringifyPayload(payload, indent);

  /* ---------- ações ---------- */
  $$('[data-modo]', el).forEach((b) => { b.onclick = () => { S.modo = b.dataset.modo; $$('[data-modo]', el).forEach((x) => x.classList.toggle('on', x === b)); hintModo(); }; });

  $('#calcular', el).onclick = (ev) => comCarga(ev.currentTarget, async () => {
    $('#valBox', el).innerHTML = '';
    const { payload, erros } = montaPayload();
    if (erros.length) { mostraErros(erros); return; }
    const body = corpoJson(payload);
    $('#jsonPrev', el).textContent = corpoJson(payload, 2);
    const box = $('#resultado', el);
    try {
      const r = S.modo === 'obs' ? await api.calcularObservabilidade(body) : await api.calcularRegimeGeral(body);
      const headers = { aviso: r.headers.get('x-warning-dados-simulados'), app: r.headers.get('x-calc-app-version'), db: r.headers.get('x-calc-db-version') };
      S.resultado = { data: r.data, modo: S.modo, headers, payload, body };
      if (S.modo === 'strict') ctx.store.ultimoRoc = { roc: r.data, payload };
      renderResultado(box, S.resultado);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      S.resultado = null;
      box.innerHTML = erroHtml(err) + (err.status === 422 && S.modo === 'strict' ? '<div class="hint">No modo estrito, um único item inconsistente rejeita a operação inteira. Use “Com observabilidade” para ver os erros por item.</div>' : '');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('#resultado', el).addEventListener('click', (ev) => comCarga0(ev));
  async function comCarga0(ev) {
    const b = ev.target.closest('[data-x]'); if (!b || !S.resultado) return;
    const x = b.dataset.x;
    if (x === 'csv') exportarCsv(S.resultado);
    else if (x === 'json') exportarJson(S.resultado);
    else if (x === 'print') window.print();
    else if (x === 'xml') {
      if (S.resultado.modo === 'strict') { ctx.store.ultimoRoc = { roc: S.resultado.data, payload: S.resultado.payload }; ctx.navegar('xml'); return; }
      await comCarga(b, async () => {
        try {
          const r = await api.calcularRegimeGeral(S.resultado.body);
          ctx.store.ultimoRoc = { roc: r.data, payload: S.resultado.payload };
          toast('Cálculo estrito executado na API para gerar o XML.');
          ctx.navegar('xml');
        } catch (err) {
          $('#resultado', el).insertAdjacentHTML('afterbegin', erroHtml(err) + '<div class="hint">O XML é gerado a partir do resultado do cálculo estrito (POST /regime-geral), que exige que todos os itens estejam consistentes.</div>');
        }
      });
    }
  }

  $('#limpar', el).onclick = () => {
    if (!confirm('Limpar toda a operação e os itens?')) return;
    S.op = { ...S.op, id: novoIdOperacao(), versao: '1.0.0', data: hoje, hora: '12:00', fuso: '-03:00', municipio: '', tpDoc: '', govOn: false, tpEnteGov: '', tpOperGov: '' };
    S.itens = [novoItem(1)]; S.resultado = null;
    $('#resultado', el).innerHTML = ''; $('#valBox', el).innerHTML = '';
    syncOpToDom(); renderItens(); recarregaCatalogo();
  };

  $('#expReq', el).onclick = () => {
    const { payload, erros } = montaPayload();
    if (erros.length) { mostraErros(erros); return; }
    baixar(`operacao-rtc-${stamp()}.json`, corpoJson(payload, 2), 'application/json');
  };

  /* ---------- importar JSON de operação ---------- */
  $('#impJson', el).onchange = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j.itens)) throw new Error('JSON sem a lista "itens".');
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/.exec(j.dhFatoGerador || j.dataHoraEmissao || '');
      Object.assign(S.op, { id: j.id || novoIdOperacao(), versao: j.versao || '1.0.0', data: m ? m[1] : hoje, hora: m ? m[2] : '12:00', fuso: m && m[3] ? m[3] : '-03:00', uf: j.uf || '', municipio: j.municipio ? String(j.municipio) : '', tpDoc: j.tpDoc ? String(j.tpDoc) : '', govOn: !!j.gCompraGov, tpEnteGov: j.gCompraGov ? String(j.gCompraGov.tpEnteGov ?? '') : '', tpOperGov: j.gCompraGov && j.gCompraGov.tpOperGov ? String(j.gCompraGov.tpOperGov) : '' });
      const s = (v) => (v === undefined || v === null ? '' : String(v).replace('.', ','));
      S.itens = j.itens.map((x, i) => {
        const it = novoItem(x.numero ?? i + 1);
        Object.assign(it, { ncm: x.ncm || '', nbs: x.nbs || '', cst: x.cst || '', cClassTrib: x.cClassTrib || '', baseCalculo: s(x.baseCalculo), quantidade: s(x.quantidade), unidade: x.unidade || '' });
        it.tipo = x.ncm && x.nbs ? 'ambos' : x.nbs ? 'nbs' : 'ncm';
        if (x.aliquotasNominais) { const a = x.aliquotasNominais; Object.assign(it.an, { cbs: s(a.cbs), ibsEstadual: s(a.ibsEstadual), ibsMunicipal: s(a.ibsMunicipal), adValorem: s(a.impostoSeletivo && a.impostoSeletivo.adValorem), adRem: s(a.impostoSeletivo && a.impostoSeletivo.adRem) }); }
        if (x.impostoSeletivo) { it.isOn = true; const q = x.impostoSeletivo; Object.assign(it.is, { cst: q.cst || '', cClassTrib: q.cClassTrib || '', baseCalculo: s(q.baseCalculo), quantidade: s(q.quantidade), unidade: q.unidade || '', impostoInformado: s(q.impostoInformado) }); }
        if (x.tributacaoRegular) { it.regOn = true; it.reg = { cst: x.tributacaoRegular.cst || '', cClassTrib: x.tributacaoRegular.cClassTrib || '' }; }
        if (x.gComponentesBC) { it.bcOn = true; for (const [k] of COMPONENTES) it.bc[k] = s(x.gComponentesBC[k]); }
        return it;
      });
      S.op.uf && (await carregaMunicipios()); if (j.municipio) { S.op.municipio = String(j.municipio); }
      syncOpToDom(); $('#opMun', el).value = S.op.municipio; renderItens(); recarregaCatalogo();
      toast(`Operação importada: ${S.itens.length} item(ns).`);
    } catch (err) { toast(`Não foi possível importar: ${err.message}`, 'bad', 6000); }
  };

  /* ---------- inicialização ---------- */
  syncOpToDom(); renderItens();
  const [ufs, dfe] = await Promise.all([api.ufs().then((r) => r.data).catch(() => []), carregaDfe(S.op.data)]);
  S.ufs = ufs; S.dfe = dfe;
  $('#opUf', el).innerHTML = optionsUf(ufs, S.op.uf, ufs.length ? 'Selecione' : 'Indisponível');
  $('#opTp', el).innerHTML = '<option value="">Não informado</option>' + dfe.filter((t) => t.suportado !== false && /^\d+$/.test(String(t.modelo))).map((t) => `<option value="${esc(t.modelo)}">${esc(t.modelo)} — ${esc(t.titulo)}</option>`).join('');
  recarregaCatalogo();
}
