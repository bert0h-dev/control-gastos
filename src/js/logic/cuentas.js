// Cuentas, transferencias y estado de cuenta de tarjetas de crédito
import { addMonths, clampDay } from './fechas.js';
import { round2 } from './calculos.js';
import { fromLegacy } from './presupuestos.js';

export const KINDS = { efectivo: 'Efectivo', banco: 'Cuenta bancaria', ahorro: 'Ahorro / inversión', credito: 'Tarjeta de crédito' };

export const DEFAULT_ACCOUNTS = [
  { id: 'efectivo', name: 'Efectivo', kind: 'efectivo', initial: 0 },
  { id: 'banco', name: 'Cuenta de banco', kind: 'banco', initial: 0 },
  { id: 'tarjeta', name: 'Tarjeta de crédito', kind: 'credito', initial: 0, limit: 20000, cutDay: 20, payDay: 10 },
];

// Cuenta probable para datos anteriores a las cuentas, según el método de pago
const accountForMethod = (method, accounts) => {
  const pick = kind => accounts.find(a => a.kind === kind)?.id;
  if (method === 'Efectivo') return pick('efectivo') || accounts[0].id;
  if (method === 'Tarjeta de crédito') return pick('credito') || accounts[0].id;
  return pick('banco') || accounts[0].id;
};

// Completa datos guardados con versiones anteriores sin perder nada
export function migrate(state) {
  if (!Array.isArray(state.accounts) || !state.accounts.length) state.accounts = structuredClone(DEFAULT_ACCOUNTS);
  const ids = new Set(state.accounts.map(a => a.id));
  for (const list of [state.tx, state.recurring])
    for (const x of list || []) if (!ids.has(x.account)) x.account = accountForMethod(x.method, state.accounts);
  if (!state.subcats || typeof state.subcats !== 'object') state.subcats = {};
  // Presupuestos: el formato anterior (un solo objeto de límites) pasa a planes con historial.
  // Se convierte también si budgetPlans está vacío: al cargar se mezcla con DEFAULT, que trae budgetPlans: []
  const legacy = fromLegacy(state.budgets);
  if (!Array.isArray(state.budgetPlans) || (!state.budgetPlans.length && legacy.length)) state.budgetPlans = legacy;
  delete state.budgets;
  return state;
}

// Efecto de un movimiento sobre una cuenta (positivo entra, negativo sale)
export function effectOn(x, accountId) {
  if (x.type === 'transferencia') return (x.to === accountId ? x.amount : 0) - (x.account === accountId ? x.amount : 0);
  if (x.account !== accountId) return 0;
  return x.type === 'ingreso' ? x.amount : -x.amount;
}

// Saldo de la cuenta con todos los movimientos hasta 'until' (incluido). En crédito, negativo = deuda
export function balanceOf(account, tx, until = '9999-12-31') {
  const cents = tx.filter(x => x.date <= until).reduce((s, x) => s + Math.round(effectOn(x, account.id) * 100), 0);
  return round2(account.initial + cents / 100);
}

export const daysBetween = (a, b) => Math.round((Date.UTC(...ymdParts(b)) - Date.UTC(...ymdParts(a))) / 864e5);
const ymdParts = s => {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
};

// Estado de cuenta de una tarjeta a la fecha 'todayStr'
export function cardStatement(card, tx, todayStr) {
  const m = todayStr.slice(0, 7);
  const cutThis = clampDay(m, card.cutDay);
  const lastCut = todayStr >= cutThis ? cutThis : clampDay(addMonths(m, -1), card.cutDay);
  const nextCut = clampDay(addMonths(lastCut.slice(0, 7), 1), card.cutDay);
  let due = clampDay(lastCut.slice(0, 7), card.payDay);
  if (due <= lastCut) due = clampDay(addMonths(lastCut.slice(0, 7), 1), card.payDay);

  const debt = Math.max(0, -balanceOf(card, tx, todayStr));
  const statement = Math.max(0, -balanceOf(card, tx, lastCut));
  const after = tx.filter(x => x.date > lastCut && x.date <= todayStr);
  const payments = after.reduce((s, x) => s + Math.max(0, effectOn(x, card.id)), 0);
  const charges = after.reduce((s, x) => s + Math.max(0, -effectOn(x, card.id)), 0);
  const toPay = Math.max(0, round2(statement - payments));
  const daysToDue = daysBetween(todayStr, due);
  return {
    debt,
    available: round2((card.limit || 0) - debt),
    usedPct: card.limit ? Math.round((debt / card.limit) * 100) : null,
    lastCut,
    nextCut,
    due,
    daysToDue,
    statement,
    payments: round2(payments),
    charges: round2(charges),
    toPay,
    level: toPay > 0 && daysToDue < 0 ? 'overdue' : toPay > 0 && daysToDue <= 5 ? 'soon' : toPay > 0 ? 'pending' : 'ok',
  };
}

// Patrimonio: suma de saldos (las deudas de tarjeta restan)
export const netWorth = (accounts, tx) => round2(accounts.reduce((s, a) => s + balanceOf(a, tx), 0));
