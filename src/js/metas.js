import { state, $, fmt, esc, ic, today, monthName, save, newId } from './core.js';
import { goalPlan, round2 } from './logic/calculos.js';
import { toast, ask } from './ui.js';
import { render } from './render.js';

// ===== Metas =====
export function renderGoals(){
  const curM = today().slice(0,7);
  $('goalList').innerHTML = state.goals.length ? state.goals.map(g => {
    const { pct: p, left, months, status, perMonth } = goalPlan(g, curM);
    const info = status === 'done' ? '<b class="pos">Meta cumplida</b>'
      : status === 'overdue' ? `<b class="neg">Fecha vencida</b> · faltan ${fmt(left)}`
      : `Ahorra <b style="color:var(--fg)">${fmt(perMonth)}</b> al mes durante ${months} mes${months>1?'es':''}`;
    const C = 2*Math.PI*26, col = p >= 100 ? 'var(--pos)' : 'var(--accent)';
    return `<div class="goal">
      <div class="goal-top">
        <div style="min-width:0"><h3>${esc(g.name)}</h3><div class="info">Para ${monthName(g.deadline)}</div></div>
        <svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-2)" stroke-width="7"/>
          <circle cx="32" cy="32" r="26" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C*p/100} ${C}" transform="rotate(-90 32 32)"/>
          <text x="32" y="36" text-anchor="middle" font-size="13" font-weight="700" fill="var(--fg)" font-family="JetBrains Mono, monospace">${Math.round(p)}%</text></svg>
      </div>
      <div class="amt"><b>${fmt(g.saved)}</b> <span style="color:var(--muted)">de ${fmt(g.target)}</span></div>
      <div class="info">${info}</div>
      <div class="btns">
        <button class="btn" onclick="moveGoal(${g.id},1)">${ic('plus')}Abonar</button>
        <button class="btn sec" onclick="moveGoal(${g.id},-1)" ${g.saved?'':'disabled'}>Retirar</button>
        <button class="iconbtn del" onclick="delGoal(${g.id})" aria-label="Eliminar meta">${ic('trash')}</button>
      </div>
    </div>`;
  }).join('') : `<div class="card empty">${ic('target')}Crea tu primera meta: vacaciones, un fondo de emergencia, un auto.</div>`;
}
$('goalForm').addEventListener('submit', e => {
  e.preventDefault();
  state.goals.push({ id: newId(), name: $('gName').value.trim(), target: round2(parseFloat($('gTarget').value)), saved: 0, deadline: $('gDeadline').value });
  $('goalForm').reset(); save(); render(); toast('Meta creada', 'target');
});
window.moveGoal = async (id, sign) => {
  const g = state.goals.find(x => x.id === id);
  const v = await ask({title: sign > 0 ? `Abonar a ${g.name}` : `Retirar de ${g.name}`, msg: sign > 0 ? `Llevas ${fmt(g.saved)} de ${fmt(g.target)}.` : `Disponible: ${fmt(g.saved)}.`, ok: sign > 0 ? 'Abonar' : 'Retirar', input: true});
  if (!(v > 0)) return;
  g.saved = Math.max(0, round2(g.saved + sign*v));
  save(); render();
  toast(g.saved >= g.target ? `¡Cumpliste la meta ${g.name}!` : sign > 0 ? `Abonaste ${fmt(v)}` : `Retiraste ${fmt(v)}`, sign > 0 ? 'check' : 'down');
};
window.delGoal = async id => {
  if (!await ask({title:'¿Eliminar meta?', ok:'Eliminar', danger:true})) return;
  state.goals = state.goals.filter(x => x.id !== id); save(); render();
};
