import { state, $, fmt, esc, ic, today, save, newId } from './core.js';
import { KINDS, balanceOf, cardStatement, netWorth } from './logic/cuentas.js';
import { round2 } from './logic/calculos.js';
import { toast, ask, closable, undoable, action } from './ui.js';
import { render } from './render.js';
import { renderTx, openTx } from './movimientos.js';

// ===== Cuentas y tarjetas =====
const ICON = { efectivo: 'wallet', banco: 'card', ahorro: 'target', credito: 'card' };
const shortDate = d => new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

// Avisos de pago de tarjeta (también se muestran en Resumen)
export function cardAlerts() {
  return state.accounts
    .filter(a => a.kind === 'credito')
    .map(c => ({ c, s: cardStatement(c, state.tx, today()) }))
    .filter(({ s }) => s.level === 'soon' || s.level === 'overdue');
}

export function renderAccounts() {
  const nw = netWorth(state.accounts, state.tx);
  $('nwValue').textContent = fmt(nw);
  $('nwValue').className = 'nw-value num ' + (nw < 0 ? 'neg' : '');
  const debt = state.accounts.filter(a => a.kind === 'credito').reduce((s, a) => s + Math.max(0, -balanceOf(a, state.tx)), 0);
  $('nwSub').textContent =
    `${state.accounts.length} cuenta${state.accounts.length === 1 ? '' : 's'}${debt ? ` · deuda en tarjetas ${fmt(debt)}` : ''}`;

  const regular = state.accounts.filter(a => a.kind !== 'credito'),
    cards = state.accounts.filter(a => a.kind === 'credito');
  const used = id => state.tx.filter(x => x.account === id || x.to === id).length;
  $('accList').innerHTML =
    regular
      .map(a => {
        const bal = balanceOf(a, state.tx);
        return `<div class="acc">
      <div class="acc-top">
        <div style="display:flex;gap:10px;align-items:center;min-width:0"><div class="acc-ico">${ic(ICON[a.kind])}</div>
          <div style="min-width:0"><h3>${esc(a.name)}</h3><div class="kind">${KINDS[a.kind]}</div></div></div>
        <div class="row-acts"><button class="iconbtn" data-action="editAcc" data-id="${esc(a.id)}" aria-label="Editar cuenta">${ic('edit')}</button><button class="iconbtn del" data-action="delAcc" data-id="${esc(a.id)}" aria-label="Eliminar cuenta">${ic('trash')}</button></div>
      </div>
      <div class="bal ${bal < 0 ? 'neg' : ''}">${fmt(bal)}</div>
      <div class="foot-l"><span>${used(a.id)} movimientos</span><a href="#movimientos" data-action="showAccount" data-id="${esc(a.id)}">Ver movimientos</a></div>
    </div>`;
      })
      .join('') || `<div class="card empty">${ic('wallet')}Agrega tu efectivo o cuenta de banco.</div>`;

  $('cardsTitle').hidden = !cards.length;
  $('cardList').innerHTML = cards
    .map(c => {
      const s = cardStatement(c, state.tx, today());
      const status = {
        ok: `${ic('check')}<span>Sin pago pendiente del corte del ${shortDate(s.lastCut)}</span>`,
        pending: `<span>Pagar <b class="num">${fmt(s.toPay)}</b> antes del ${shortDate(s.due)}</span><span class="hint">faltan ${s.daysToDue} días</span>`,
        soon: `${ic('alert')}<span>Pagar <b class="num">${fmt(s.toPay)}</b> antes del ${shortDate(s.due)}</span><b>${s.daysToDue === 0 ? 'vence hoy' : `faltan ${s.daysToDue} día${s.daysToDue === 1 ? '' : 's'}`}</b>`,
        overdue: `${ic('alert')}<span>Pago vencido el ${shortDate(s.due)}: <b class="num">${fmt(s.toPay)}</b></span>`,
      }[s.level];
      return `<div class="card card-block">
      <div class="cc">
        <div class="cc-top"><div class="cc-chip"></div><div class="cc-acts">
          <button class="iconbtn" data-action="editAcc" data-id="${esc(c.id)}" aria-label="Editar tarjeta">${ic('edit')}</button>
          <button class="iconbtn" data-action="delAcc" data-id="${esc(c.id)}" aria-label="Eliminar tarjeta">${ic('trash')}</button></div></div>
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-debt"><small>Deuda actual</small>${fmt(s.debt)}</div>
        <div class="meter"><i style="width:${Math.min(100, s.usedPct || 0)}%;${(s.usedPct || 0) >= 80 ? 'background:#ff7a6b' : ''}"></i></div>
        <div class="cc-meta"><span>Disponible ${fmt(s.available)}</span><span>Límite ${fmt(c.limit || 0)}${s.usedPct !== null ? ` · ${s.usedPct}%` : ''}</span></div>
      </div>
      <div class="pay-status ${s.level}">${status}</div>
      <div class="stmt">
        <div><small>Saldo al corte (${shortDate(s.lastCut)})</small><b>${fmt(s.statement)}</b></div>
        <div><small>Pagos desde el corte</small><b class="pos">${fmt(s.payments)}</b></div>
        <div><small>Cargos nuevos</small><b>${fmt(s.charges)}</b></div>
        <div><small>Próximo corte</small><b>${shortDate(s.nextCut)}</b></div>
        <div><small>Fecha de pago</small><b>${shortDate(s.due)}</b></div>
        <div style="align-self:end"><button class="btn" data-action="payCard" data-id="${esc(c.id)}" ${s.debt ? '' : 'disabled'}>${ic('swap')}Pagar</button></div>
      </div>
    </div>`;
    })
    .join('');
  $('cCards').hidden = !cardAlerts().length;
}

// ----- Acciones -----
action('showAccount', ({ id }) => {
  $('fAcc').value = id;
  $('fPeriod').value = 'todo';
  renderTx();
});
action('payCard', ({ id }) => {
  const c = state.accounts.find(a => a.id === id),
    s = cardStatement(c, state.tx, today());
  const from = state.accounts.find(a => a.kind === 'banco') || state.accounts.find(a => a.kind !== 'credito');
  openTx(null, { type: 'transferencia', to: id, account: from?.id, amount: s.toPay || s.debt, desc: `Pago ${c.name}` });
});
$('btnTransfer').onclick = () => openTx(null, { type: 'transferencia' });

// ----- Modal de cuenta -----
$('accKind').innerHTML = Object.entries(KINDS)
  .map(([k, v]) => `<option value="${k}">${v}</option>`)
  .join('');
const syncKind = () => {
  const credit = $('accKind').value === 'credito';
  document.querySelectorAll('#accForm [data-credit]').forEach(el => (el.hidden = !credit));
  $('accInitialLabel').textContent = credit ? 'Deuda inicial' : 'Saldo inicial';
};
$('accKind').onchange = syncKind;
closable($('accModal'));

function openAcc(id) {
  const a = id ? state.accounts.find(x => x.id === id) : null;
  $('accForm').reset();
  $('accId').value = a?.id || '';
  $('accName').value = a?.name || '';
  $('accKind').value = a?.kind || 'banco';
  // En tarjetas se captura la deuda como número positivo
  $('accInitial').value = a ? (a.kind === 'credito' ? -a.initial : a.initial) : 0;
  $('accLimit').value = a?.limit ?? '';
  $('accCut').value = a?.cutDay ?? '';
  $('accPay').value = a?.payDay ?? '';
  $('accKind').disabled = !!a && state.tx.some(x => x.account === a.id || x.to === a.id) && a.kind === 'credito';
  syncKind();
  $('accModalTitle').textContent = a ? 'Editar cuenta' : 'Nueva cuenta';
  $('accModal').hidden = false;
  $('accName').focus();
}
action('editAcc', ({ id }) => openAcc(id));
$('btnNewAcc').onclick = () => openAcc();

$('accForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('accId').value,
    kind = $('accKind').value,
    credit = kind === 'credito';
  const initial = round2(parseFloat($('accInitial').value) || 0);
  const a = { id: id || 'a' + newId(), name: $('accName').value.trim(), kind, initial: credit ? -Math.abs(initial) : initial };
  if (credit) {
    const day = v => Math.min(31, Math.max(1, parseInt(v) || 1));
    Object.assign(a, {
      limit: round2(parseFloat($('accLimit').value) || 0),
      cutDay: day($('accCut').value),
      payDay: day($('accPay').value),
    });
    if (!$('accCut').value || !$('accPay').value) return toast('Indica el día de corte y el día de pago', 'alert');
  }
  if (id) state.accounts = state.accounts.map(x => (x.id === id ? a : x));
  else state.accounts.push(a);
  save();
  $('accModal').hidden = true;
  render();
  toast(id ? 'Cuenta actualizada' : 'Cuenta creada', 'card');
});

action('delAcc', async ({ id }) => {
  const a = state.accounts.find(x => x.id === id);
  if (state.accounts.length <= 1) return toast('Debe quedar al menos una cuenta', 'alert');
  const n = state.tx.filter(x => x.account === id || x.to === id).length;
  const other = state.accounts.find(x => x.id !== id);
  // Con movimientos se confirma antes, porque se mueven a otra cuenta
  if (
    n &&
    !(await ask({
      title: `¿Eliminar "${a.name}"?`,
      msg: `Tiene ${n} movimientos. Se moverán a "${other.name}" y las transferencias hacia o desde ella se eliminarán.`,
      ok: 'Eliminar',
      danger: true,
    }))
  )
    return;
  undoable(`Cuenta "${a.name}" eliminada`, 'trash', () => {
    state.tx = state.tx
      .filter(x => !(x.type === 'transferencia' && (x.account === id || x.to === id)))
      .map(x => (x.account === id ? { ...x, account: other.id } : x));
    state.recurring.forEach(r => {
      if (r.account === id) r.account = other.id;
    });
    state.accounts = state.accounts.filter(x => x.id !== id);
  });
});
