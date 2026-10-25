import { state, $, fmt, esc, ic, today, monthName, month, save, catColor, setMonth, newId, accName } from './core.js';
import { filterTx, groupByDay, netOf, round2 } from './logic/calculos.js';
import { addMonths } from './logic/fechas.js';
import { parseTags } from './logic/analisis.js';
import { toast, fillCatSelect, fillAccSelect, undoable } from './ui.js';
import { render } from './render.js';

// ===== Movimientos: lista, filtros y modal =====
export function txFilters(){
  const p = $('fPeriod').value;
  return { month, cat: $('fCat').value, type: $('fType').value, q: $('fSearch').value, account: $('fAcc').value,
    all: p === 'todo', from: p === 'rango' ? $('fFrom').value : '', to: p === 'rango' ? $('fTo').value : '' };
}
export const filteredTx = () => filterTx(state.tx, txFilters());

export function renderTx(){
  const f = txFilters(), list = filteredTx(), multiYear = f.all || f.from.slice(0,4) !== f.to.slice(0,4);
  $('fRange').hidden = $('fPeriod').value !== 'rango';
  $('txTitle').textContent = f.all ? 'Todo el historial' : $('fPeriod').value === 'rango' ? 'Rango seleccionado' : 'Movimientos de ' + monthName(month, {month:'long'});
  const net = netOf(list);
  $('txSum').innerHTML = list.length ? `${list.length} · neto <b class="num ${net>=0?'pos':'neg'}">${fmt(net)}</b>` : '';
  if (!list.length) { $('txList').innerHTML = `<div class="empty">${ic('list')}No hay movimientos con estos filtros.<button class="btn" onclick="openTx()">${ic('plus')}Registrar uno</button></div>`; return; }
  $('txList').innerHTML = groupByDay(list).map(day => {
    const d = new Date(day.date + 'T12:00');
    return `<div class="day"><span>${d.toLocaleDateString('es-MX',{weekday:'long', day:'numeric', month:'short', year: multiYear ? 'numeric' : undefined})}</span><span class="num">${fmt(day.net)}</span></div>`
      + day.items.map(txRow).join('');
  }).join('');
}

const small = name => ic(name).replace('class="ic"', 'class="ic" style="width:11px;height:11px"');

function txRow(x){
  const isT = x.type === 'transferencia', col = isT ? 'var(--accent)' : catColor(x.cat);
  const tags = (x.tags || []).map(t => `<button class="tagchip" onclick="filterTag('${esc(t)}')">#${esc(t)}</button>`).join('');
  const meta = isT
    ? `<span class="tag">${small('swap')}${esc(accName(x.account))} → ${esc(accName(x.to))}</span>`
    : `<span class="tag"><i class="swatch" style="background:${col}"></i>${esc(x.cat)}${x.sub ? ' › ' + esc(x.sub) : ''}</span>${esc(accName(x.account))}`;
  return `<div class="tx">
    <div class="avatar" style="background:color-mix(in srgb,${col} 16%,transparent);color:${col}">${isT ? ic('swap') : esc(x.cat.charAt(0))}</div>
    <div class="meta"><b>${esc(x.desc)}</b><span>${meta}${x.recId ? ` <span class="tag">${small('repeat')}recurrente</span>` : ''}${tags}${x.note && x.note !== 'Recurrente' ? ' · ' + esc(x.note) : ''}</span></div>
    <div class="amt ${isT ? '' : x.type==='ingreso' ? 'pos' : 'neg'}">${isT ? '' : x.type==='ingreso' ? '+' : '−'}${fmt(x.amount)}</div>
    <div class="acts"><button class="iconbtn" onclick="openTx(${x.id})" aria-label="Editar">${ic('edit')}</button><button class="iconbtn del" onclick="delTx(${x.id})" aria-label="Eliminar">${ic('trash')}</button></div>
  </div>`;
}

window.filterTag = t => { $('fSearch').value = '#' + t; renderTx(); };

// ----- Modal -----
export const curType = () => document.querySelector('input[name=type]:checked').value;

function syncType(){
  const t = curType(), isT = t === 'transferencia';
  document.querySelectorAll('#txForm [data-transfer]').forEach(el => el.hidden = !isT);
  document.querySelectorAll('#txForm [data-not-transfer]').forEach(el => el.hidden = isT);
  $('txAccLabel').firstChild.textContent = isT ? 'Cuenta origen' : 'Cuenta';
  $('txDesc').placeholder = isT ? 'Pago de tarjeta, ahorro…' : t === 'ingreso' ? 'Salario' : 'Supermercado';
  if (!isT) fillCatSelect($('txCat'), t);
  syncSubs();
}
// Sugerencias de subcategoría: las guardadas para la categoría elegida
function syncSubs(){
  $('txSubList').innerHTML = (state.subcats[$('txCat').value] || []).map(s => `<option value="${esc(s)}">`).join('');
}

// 'preset' permite abrir el modal con valores, p. ej. una transferencia hacia una tarjeta
window.openTx = (id, preset = {}) => {
  const x = id ? state.tx.find(t => t.id === id) : null, v = x || preset;
  $('txForm').reset(); $('txId').value = x ? x.id : '';
  fillAccSelect($('txAccount')); fillAccSelect($('txTo'));
  $({ ingreso: 'tI', transferencia: 'tT' }[v.type] || 'tG').checked = true;
  syncType();
  const t = today();
  $('txDate').value = v.date || (month === t.slice(0,7) ? t : month + '-01');
  $('txAccount').value = v.account || state.accounts[0]?.id;
  if (v.to) $('txTo').value = v.to;
  else if ($('txTo').value === $('txAccount').value) $('txTo').selectedIndex = Math.min(1, state.accounts.length - 1);
  if (v.desc) $('txDesc').value = v.desc;
  if (v.amount) $('txAmount').value = v.amount;
  if (v.cat) { $('txCat').value = v.cat; syncSubs(); }
  $('txSub').value = v.sub || ''; $('txTags').value = (v.tags || []).map(t => '#' + t).join(' '); $('txNote').value = v.note || '';
  $('txModalTitle').textContent = x ? 'Editar movimiento' : v.type === 'transferencia' ? 'Nueva transferencia' : 'Nuevo movimiento';
  $('btnSave').textContent = x ? 'Guardar cambios' : 'Agregar';
  $('txModal').hidden = false; $('txAmount').focus();
};
export const closeTx = () => $('txModal').hidden = true;
document.querySelectorAll('input[name=type]').forEach(r => r.onchange = syncType);
$('txCat').addEventListener('change', syncSubs);
$('txModal').addEventListener('click', e => { if (e.target === $('txModal') || e.target.closest('[data-close]')) closeTx(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('dlg').hidden) $('dlgCancel').click();
    else document.querySelectorAll('.backdrop:not([hidden])').forEach(m => m.hidden = true);
  }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('.backdrop:not([hidden])')) { e.preventDefault(); openTx(); }
});
$('btnNew').onclick = () => openTx();

$('txForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('txId').value, type = curType(), isT = type === 'transferencia';
  const old = id ? state.tx.find(x => x.id === +id) : null;
  const tx = { id: id ? +id : newId(), type, desc: $('txDesc').value.trim(), amount: round2(parseFloat($('txAmount').value)),
    date: $('txDate').value, account: $('txAccount').value, note: $('txNote').value.trim() };
  if (old?.recId) tx.recId = old.recId;
  if (isT) {
    tx.to = $('txTo').value;
    if (tx.to === tx.account) return toast('Elige una cuenta destino distinta a la de origen', 'alert');
  } else {
    tx.cat = $('txCat').value;
    const sub = $('txSub').value.trim();
    if (sub) {
      tx.sub = sub;
      const list = state.subcats[tx.cat] ||= [];
      if (!list.includes(sub)) list.push(sub);
    }
  }
  const tags = parseTags($('txTags').value); if (tags.length) tx.tags = tags;
  if (!tx.desc || !(tx.amount > 0)) return;
  if (old) state.tx = state.tx.map(x => x.id === tx.id ? tx : x); else state.tx.push(tx);
  save(); closeTx(); render();
  toast(old ? 'Movimiento actualizado' : `${{ gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' }[type]} de ${fmt(tx.amount)} registrado`);
});
window.delTx = id => {
  const x = state.tx.find(t => t.id === id);
  undoable(`"${x.desc}" eliminado`, 'trash', () => { state.tx = state.tx.filter(t => t.id !== id); });
};

// ===== Periodo y filtros =====
$('mPrev').onclick = () => { setMonth(addMonths(month, -1)); render(); };
$('mNext').onclick = () => { setMonth(addMonths(month, 1)); render(); };
['fCat','fType','fSearch','fAcc','fFrom','fTo'].forEach(id => $(id).addEventListener('input', renderTx));
$('fPeriod').addEventListener('input', () => {
  // Al elegir rango, empieza con el mes seleccionado
  if ($('fPeriod').value === 'rango' && !$('fFrom').value) { $('fFrom').value = month + '-01'; $('fTo').value = today(); }
  renderTx();
});
