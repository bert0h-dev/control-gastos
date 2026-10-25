import { state, $, fmt, fmt0, esc, today, monthName, month, allCats } from './core.js';
import { monthSummary, budgetStatus, dailyAverage, inMonth } from './logic/calculos.js';
import { projectMonth } from './logic/analisis.js';
import { opts, fillCatSelect, fillAccSelect } from './ui.js';
import { renderAccounts } from './cuentas.js';
import { renderAnalysis } from './analisis.js';
import { renderAppearance } from './apariencia.js';
import { renderSummary } from './resumen.js';
import { renderTx } from './movimientos.js';
import { renderBudgets } from './presupuestos.js';
import { renderRecurring } from './recurrentes.js';
import { renderGoals } from './metas.js';
import { renderCats } from './categorias.js';

// ===== Render =====
export function render() {
  fillAccSelect($('fAcc'), 'Todas las cuentas');
  fillAccSelect($('rAccount'));
  renderHeader();
  renderSummary();
  renderTx();
  renderAccounts();
  renderAnalysis();
  renderBudgets();
  renderRecurring();
  renderGoals();
  renderCats();
  renderAppearance();
  $('cTx').textContent = inMonth(state.tx, month).length;
  $('cRec').textContent = state.recurring.filter(r => r.active).length;
  $('cGoal').textContent = state.goals.length;
  fillCatSelect($('bCat'), 'gasto');
  fillCatSelect($('rCat'), document.querySelector('input[name=rtype]:checked').value);
  const fc = $('fCat'),
    fp = fc.value;
  fc.innerHTML = '<option value="">Todas las categorías</option>' + opts(allCats());
  fc.value = fp;
}

function renderHeader() {
  const ml = monthName(month);
  $('mLabel').textContent = ml.charAt(0).toUpperCase() + ml.slice(1);
  const s = monthSummary(state.tx, month);
  $('balLabel').textContent = `Balance de ${monthName(month, { month: 'long' })}`;
  const [ent, cen] = fmt(Math.abs(s.bal)).split('.');
  $('hBal').innerHTML = `${s.bal < 0 ? '−' : ''}${esc(ent)}<span class="cents">.${esc(cen || '00')}</span>`;
  $('hInc').textContent = fmt(s.inc);
  $('hExp').textContent = fmt(s.exp);
  $('kSave').textContent = s.rate === null ? '—' : s.rate + '%';
  $('kSaveBar').style.width = Math.max(0, Math.min(100, s.rate || 0)) + '%';

  const b = budgetStatus(state.tx, state.budgets, month);
  if (b.items.length) {
    $('kBud').textContent = b.pct + '%';
    $('kBudBar').style.width = Math.min(100, b.pct) + '%';
    $('kBudBar').style.background = b.pct >= 100 ? '#ff7a6b' : b.pct >= 80 ? '#f0b443' : '';
    $('kBudSub').textContent = `${fmt0(b.spent)} de ${fmt0(b.limit)}`;
  } else {
    $('kBud').textContent = '—';
    $('kBudBar').style.width = '0';
    $('kBudSub').textContent = 'sin límites definidos';
  }

  // Proyección del mes en curso; en otros meses, el gasto diario promedio
  const p = projectMonth(state.tx, state.recurring, month, today()),
    d = dailyAverage(state.tx, month, today());
  $('kProjLabel').textContent = p.isCur ? 'Proyección de gasto' : 'Gasto diario';
  $('kProj').textContent = p.isCur ? fmt0(p.projExp) : fmt0(d.avg);
  const used = p.isCur && p.projExp ? Math.round((p.exp / p.projExp) * 100) : 0;
  $('kProjBar').style.width = (p.isCur ? used : 0) + '%';
  $('kProjBar').style.background = p.isCur && p.projExp > p.projInc ? '#ff7a6b' : '';
  $('kProjSub').textContent = p.isCur ? `${fmt0(d.avg)}/día · faltan ${d.left} día${d.left === 1 ? '' : 's'}` : `en ${d.days} días`;
}
