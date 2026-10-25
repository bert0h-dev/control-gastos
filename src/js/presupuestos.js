import { state, $, fmt, fmt0, esc, ic, monthName, month, save, catColor } from './core.js';
import { budgetStatus, round2 } from './logic/calculos.js';
import { lastMonths, addMonths } from './logic/fechas.js';
import { SIEMPRE, effectiveBudgets, planStart, setLimit, copyToNextMonth, nextMonthDiffers, budgetHistory } from './logic/presupuestos.js';
import { toast, undoable, action } from './ui.js';
import { render } from './render.js';

// ===== Presupuestos =====
// Los límites rigen desde un mes en adelante (ver logic/presupuestos.js): editar en el mes que estás viendo
// no cambia los meses anteriores.
const LEVELS = { over: ['var(--neg)', 'Excedido'], warn: ['var(--warn)', 'Cerca del límite'], ok: ['var(--pos)', 'En orden'] };
let histMonths = 6;
const mName = m => monthName(m, { month: 'long', year: 'numeric' });

export function renderBudgets() {
  $('budMonth').textContent = monthName(month);
  const limits = effectiveBudgets(state.budgetPlans, month);
  const since = planStart(state.budgetPlans, month);
  $('budSince').textContent = !since
    ? ''
    : since === SIEMPRE
      ? 'Estos límites rigen desde antes de que existiera el historial.'
      : since === month
        ? `Límites definidos en ${mName(month)}.`
        : `Límites vigentes desde ${mName(since)}.`;
  $('budFormHint').textContent =
    `El límite se aplica desde ${mName(month)} en adelante. Los meses anteriores conservan los suyos. ` +
    'Las barras cambian a ámbar al 80% y a rojo al pasarte.';

  const { items } = budgetStatus(state.tx, limits, month);
  $('budgetBars').innerHTML = items.length
    ? items
        .map(b => {
          const [col, label] = LEVELS[b.level];
          return `<div class="bar-row"><div class="top"><span class="l"><i class="swatch" style="background:${catColor(b.cat)}"></i><b>${esc(b.cat)}</b>
      <span class="pill" style="color:${col}">${b.level !== 'ok' ? ic('alert').replace('class="ic"', 'class="ic" style="width:12px;height:12px"') : ''}${label}</span></span>
      <span class="r">${fmt(b.spent)} / ${fmt(b.limit)} <button class="iconbtn" data-action="editBudget" data-cat="${esc(b.cat)}" aria-label="Editar límite">${ic('edit')}</button><button class="iconbtn del" data-action="delBudget" data-cat="${esc(b.cat)}" aria-label="Quitar límite">${ic('x')}</button></span></div>
      <div class="track"><i style="width:${Math.min(b.pct, 100)}%;background:${col}"></i></div>
      <div class="hint" style="margin-top:4px;font-size:.78rem">${b.level === 'over' ? `Te pasaste por ${fmt(-b.left)}` : `Disponible ${fmt(b.left)} · ${Math.round(b.pct)}% usado`}</div></div>`;
        })
        .join('')
    : `<div class="empty">${ic('gauge')}No hay límites para ${mName(month)}. Define uno a la derecha.</div>`;

  // Copiar al mes siguiente: solo tiene sentido si el mes siguiente tiene límites distintos
  const differs = items.length > 0 && nextMonthDiffers(state.budgetPlans, month);
  $('budCopy').hidden = !differs;
  if (differs)
    $('budCopyHint').textContent =
      `${monthName(addMonths(month, 1), { month: 'long' })} tiene límites distintos. Puedes igualarlos a los de este mes.`;

  renderHistory();
}

function renderHistory() {
  document.querySelectorAll('#budRange button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.n) === histMonths));
  const months = lastMonths(month, histMonths);
  const h = budgetHistory(state.tx, state.budgetPlans, months);
  if (!h.byCat.length) {
    $('budHistHint').textContent = '';
    $('budHist').innerHTML =
      `<tbody><tr><td class="empty">${ic('gauge')}Cuando definas límites, aquí verás mes a mes si los cumpliste.</td></tr></tbody>`;
    return;
  }
  const overTotal = h.rows.reduce((s, r) => s + r.over, 0);
  const clean = h.rows.filter(r => r.items.length && r.over === 0).length,
    evaluated = h.rows.filter(r => r.items.length).length;
  $('budHistHint').textContent =
    `De ${evaluated} ${evaluated === 1 ? 'mes con movimientos' : 'meses con movimientos'}: ${clean} ${clean === 1 ? 'mes' : 'meses'} sin pasarte de ningún límite ` +
    `y ${overTotal} ${overTotal === 1 ? 'límite excedido' : 'límites excedidos'} en total.`;
  const short = m => monthName(m, { month: 'short' }).replace('.', '') + (m.endsWith('-01') ? ' ' + m.slice(2, 4) : '');
  const cell = (c, i) => {
    if (!c) return `<td class="bh-none" title="${h.rows[i].noData ? 'Sin movimientos registrados' : 'Sin límite este mes'}">—</td>`;
    const [col] = LEVELS[c.level];
    return `<td class="bh-cell" title="${fmt(c.spent)} de ${fmt(c.limit)}"><span style="--c:${col}">${Math.round(c.pct)}%</span><small>${fmt0(c.spent)}</small></td>`;
  };
  const sum = c =>
    (c.overMonths ? `<b class="neg">${c.overMonths} de ${c.months}</b>` : `<span class="pos">0 de ${c.months}</span>`) +
    (c.streak >= 2 ? `<small>${c.streak} meses en orden</small>` : '');
  $('budHist').innerHTML = `
    <thead><tr><th>Categoría</th>${months.map(m => `<th class="${m === month ? 'cur' : ''}">${short(m)}</th>`).join('')}<th>Excedido</th></tr></thead>
    <tbody>${h.byCat
      .map(
        c =>
          `<tr><td><span class="l"><i class="swatch" style="background:${catColor(c.cat)}"></i>${esc(c.cat)}</span></td>${c.cells.map((x, i) => cell(x, i)).join('')}<td class="bh-sum">${sum(c)}</td></tr>`
      )
      .join('')}</tbody>
    <tfoot><tr><td>Límites excedidos</td>${h.rows.map(r => `<td class="${r.over ? 'neg' : 'pos'}">${r.items.length ? r.over : '—'}</td>`).join('')}<td></td></tr></tfoot>`;
}

$('budgetForm').addEventListener('submit', e => {
  e.preventDefault();
  const cat = $('bCat').value;
  state.budgetPlans = setLimit(state.budgetPlans, month, cat, round2(parseFloat($('bAmount').value)));
  $('bAmount').value = '';
  save();
  render();
  toast(`Límite de ${cat} guardado desde ${monthName(month, { month: 'long' })}`);
});
action('delBudget', ({ cat: c }) =>
  undoable(`Límite de ${c} quitado desde ${monthName(month, { month: 'long' })}`, 'trash', () => {
    state.budgetPlans = setLimit(state.budgetPlans, month, c, null);
  })
);
// Editar un límite: carga sus valores en el formulario
action('editBudget', ({ cat: c }) => {
  $('bCat').value = c;
  $('bAmount').value = effectiveBudgets(state.budgetPlans, month)[c] ?? '';
  $('bAmount').focus();
});
$('btnBudCopy').onclick = () => {
  state.budgetPlans = copyToNextMonth(state.budgetPlans, month);
  save();
  render();
  toast(`Límites copiados a ${monthName(addMonths(month, 1), { month: 'long' })}`);
};
$('budRange').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]');
  if (!b) return;
  histMonths = Number(b.dataset.n);
  renderHistory();
});
