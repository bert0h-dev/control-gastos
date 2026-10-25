import { state, $, fmt, esc, ic, today, save, catColor, newId, accName } from './core.js';
import { generatePending, resume, monthlyNet } from './logic/recurrentes.js';
import { round2 } from './logic/calculos.js';
import { toast, fillCatSelect, undoable } from './ui.js';
import { render } from './render.js';

// ===== Recurrentes =====
// Registra los movimientos pendientes desde el último mes generado hasta hoy
export function runRecurring() {
  const pending = generatePending(state.recurring, today(), newId);
  if (pending.length) {
    state.tx.push(...pending);
    save();
  }
  return pending.length;
}
export function renderRecurring() {
  const act = state.recurring.filter(r => r.active),
    net = monthlyNet(state.recurring);
  $('recSum').innerHTML = act.length ? `Neto mensual <b class="num ${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b>` : '';
  const list = [...state.recurring].sort((a, b) => a.day - b.day);
  $('recList').innerHTML = list.length
    ? list
        .map(
          r => `
    <div class="li ${r.active ? '' : 'off'}">
      <div class="daybadge"><div><b>${r.day}</b><br><small>día</small></div></div>
      <div style="min-width:0"><b>${esc(r.desc)}</b><div class="hint" style="font-size:.8rem;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><i class="swatch" style="background:${catColor(r.cat)}"></i>${esc(r.cat)} · ${esc(accName(r.account))}${r.active ? '' : ' · en pausa'}</div></div>
      <div class="num ${r.type === 'ingreso' ? 'pos' : 'neg'}" style="font-weight:700">${r.type === 'ingreso' ? '+' : '−'}${fmt(r.amount)}</div>
      <div class="acts"><button class="iconbtn" onclick="editRec(${r.id})" aria-label="Editar">${ic('edit')}</button><button class="iconbtn" onclick="toggleRec(${r.id})" aria-label="${r.active ? 'Pausar' : 'Reanudar'}">${ic(r.active ? 'pause' : 'play')}</button><button class="iconbtn del" onclick="delRec(${r.id})" aria-label="Eliminar">${ic('trash')}</button></div>
    </div>`
        )
        .join('')
    : `<div class="empty">${ic('repeat')}Programa la renta, suscripciones o tu salario y se registrarán solos cada mes.</div>`;
}
const rType = () => document.querySelector('input[name=rtype]:checked').value;
document.querySelectorAll('input[name=rtype]').forEach(r => (r.onchange = () => fillCatSelect($('rCat'), r.value)));

// El mismo formulario sirve para crear y editar
function resetRecForm() {
  $('recForm').reset();
  $('rId').value = '';
  $('rStart').value = today().slice(0, 7);
  $('rStart').disabled = false;
  fillCatSelect($('rCat'), 'gasto');
  $('recFormTitle').textContent = 'Nuevo recurrente';
  $('rSave').lastElementChild.textContent = 'Programar';
  $('rCancel').hidden = true;
  $('recEditHint').hidden = true;
}
$('rCancel').onclick = resetRecForm;

window.editRec = id => {
  const r = state.recurring.find(x => x.id === id);
  $('rId').value = r.id;
  $(r.type === 'ingreso' ? 'rI' : 'rG').checked = true;
  fillCatSelect($('rCat'), r.type);
  $('rDesc').value = r.desc;
  $('rAmount').value = r.amount;
  $('rDay').value = r.day;
  $('rCat').value = r.cat;
  $('rAccount').value = r.account;
  $('rStart').value = r.start;
  // Si ya generó movimientos, cambiar el inicio no tendría efecto
  $('rStart').disabled = !!r.lastGen;
  $('recFormTitle').textContent = 'Editar recurrente';
  $('rSave').lastElementChild.textContent = 'Guardar cambios';
  $('rCancel').hidden = false;
  $('recEditHint').hidden = false;
  $('recForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('rDesc').focus();
};

$('recForm').addEventListener('submit', e => {
  e.preventDefault();
  const fields = {
    type: rType(),
    desc: $('rDesc').value.trim(),
    amount: round2(parseFloat($('rAmount').value)),
    day: Math.min(31, Math.max(1, parseInt($('rDay').value))),
    cat: $('rCat').value,
    account: $('rAccount').value,
  };
  const id = +$('rId').value;
  if (id) {
    const r = state.recurring.find(x => x.id === id);
    Object.assign(r, fields, r.lastGen ? {} : { start: $('rStart').value });
    const n = runRecurring();
    save();
    resetRecForm();
    render();
    toast(n ? `Recurrente actualizado. Se registraron ${n} movimiento(s) pendiente(s)` : 'Recurrente actualizado', 'repeat');
    return;
  }
  state.recurring.push({ id: newId(), ...fields, method: '', start: $('rStart').value, lastGen: null, active: true });
  const n = runRecurring();
  save();
  resetRecForm();
  render();
  toast(n ? `Programado. Se registraron ${n} movimiento(s) pendiente(s)` : 'Recurrente programado', 'repeat');
});
window.toggleRec = id => {
  const r = state.recurring.find(x => x.id === id);
  if (r.active) r.active = false;
  else {
    resume(r, today());
    runRecurring();
  }
  save();
  render();
  toast(r.active ? 'Recurrente reanudado' : 'Recurrente en pausa', r.active ? 'play' : 'pause');
};
window.delRec = id => {
  const r = state.recurring.find(x => x.id === id);
  if (+$('rId').value === id) resetRecForm();
  undoable(`"${r.desc}" eliminado. Los movimientos ya registrados se conservan`, 'trash', () => {
    state.recurring = state.recurring.filter(x => x.id !== id);
  });
};
