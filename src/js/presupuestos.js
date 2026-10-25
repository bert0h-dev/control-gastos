import { state, $, fmt, esc, ic, monthName, month, save, catColor } from './core.js';
import { budgetStatus, round2 } from './logic/calculos.js';
import { toast, undoable } from './ui.js';
import { render } from './render.js';

// ===== Presupuestos =====
const LEVELS = { over: ['var(--neg)', 'Excedido'], warn: ['var(--warn)', 'Cerca del límite'], ok: ['var(--pos)', 'En orden'] };

export function renderBudgets(){
  $('budMonth').textContent = monthName(month);
  const { items } = budgetStatus(state.tx, state.budgets, month);
  $('budgetBars').innerHTML = items.length ? items.map(b => {
    const [col, label] = LEVELS[b.level];
    return `<div class="bar-row"><div class="top"><span class="l"><i class="swatch" style="background:${catColor(b.cat)}"></i><b>${esc(b.cat)}</b>
      <span class="pill" style="color:${col}">${b.level !== 'ok' ? ic('alert').replace('class="ic"','class="ic" style="width:12px;height:12px"') : ''}${label}</span></span>
      <span class="r">${fmt(b.spent)} / ${fmt(b.limit)} <button class="iconbtn" onclick="editBudget('${esc(b.cat).replace(/'/g,"\\'")}')" aria-label="Editar límite">${ic('edit')}</button><button class="iconbtn del" onclick="delBudget('${esc(b.cat).replace(/'/g,"\\'")}')" aria-label="Quitar límite">${ic('x')}</button></span></div>
      <div class="track"><i style="width:${Math.min(b.pct,100)}%;background:${col}"></i></div>
      <div class="hint" style="margin-top:4px;font-size:.78rem">${b.level === 'over' ? `Te pasaste por ${fmt(-b.left)}` : `Disponible ${fmt(b.left)} · ${Math.round(b.pct)}% usado`}</div></div>`;
  }).join('') : `<div class="empty">${ic('gauge')}Aún no tienes límites. Define uno a la derecha.</div>`;
}

$('budgetForm').addEventListener('submit', e => {
  e.preventDefault(); state.budgets[$('bCat').value] = round2(parseFloat($('bAmount').value));
  $('bAmount').value = ''; save(); render(); toast('Límite guardado');
});
window.delBudget = c => undoable(`Límite de ${c} eliminado`, 'trash', () => { delete state.budgets[c]; });
// Editar un límite: carga sus valores en el formulario
window.editBudget = c => { $('bCat').value = c; $('bAmount').value = state.budgets[c]; $('bAmount').focus(); };
