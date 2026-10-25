// Cálculos puros sobre los datos: reciben arreglos y devuelven números u objetos, sin tocar el DOM
import { addMonths, daysIn, monthsUntil, lastMonths } from './fechas.js';

export const round2 = n => Math.round(n*100)/100;
// Suma en centavos para evitar errores de punto flotante (0.1 + 0.2)
export const sum = (list, get = x => x) => list.reduce((s, x) => s + Math.round(get(x)*100), 0) / 100;
export const sumOf = (list, type, cat) => sum(list.filter(x => x.type === type && (!cat || x.cat === cat)), x => x.amount);
export const inMonth = (tx, m) => tx.filter(x => x.date.startsWith(m));
// Las transferencias entre cuentas no son ingreso ni gasto
const signed = x => x.type === 'ingreso' ? x.amount : x.type === 'gasto' ? -x.amount : 0;

export function monthSummary(tx, m){
  const list = inMonth(tx, m), inc = sumOf(list, 'ingreso'), exp = sumOf(list, 'gasto'), bal = round2(inc - exp);
  return { count: list.length, inc, exp, bal, rate: inc ? Math.round(bal/inc*100) : null };
}

// Gasto por categoría, de mayor a menor, con su porcentaje del total
export function expensesByCategory(tx, m){
  const list = inMonth(tx, m).filter(x => x.type === 'gasto'), total = sum(list, x => x.amount), by = {};
  list.forEach(x => by[x.cat] = round2((by[x.cat] || 0) + x.amount));
  return Object.entries(by).sort((a,b) => b[1]-a[1]).map(([cat, amount]) => ({ cat, amount, pct: Math.round(amount/total*100) }));
}

// Gasto diario promedio: en el mes actual cuenta los días transcurridos, en meses pasados el mes completo
export function dailyAverage(tx, m, todayStr){
  const isCur = todayStr.slice(0,7) === m, days = isCur ? +todayStr.slice(8) : daysIn(m);
  return { avg: sumOf(inMonth(tx, m), 'gasto') / days, days, left: isCur ? daysIn(m) - days : 0, isCur };
}

// Comparativo contra el mes anterior. pct = Infinity cuando antes era 0 y ahora no
export function compareMonths(tx, m, threshold = 20){
  const p = addMonths(m, -1), cur = inMonth(tx, m), prev = inMonth(tx, p);
  const row = (type, cat) => {
    const a = sumOf(prev, type, cat), b = sumOf(cur, type, cat), diff = round2(b - a);
    const pct = a ? diff/a*100 : (b ? Infinity : 0);
    // Para gastos subir es malo; para ingresos subir es bueno
    return { type, cat, prev: a, cur: b, diff, pct, good: type === 'ingreso' ? diff >= 0 : diff <= 0 };
  };
  const cats = [...new Set([...cur, ...prev].filter(x => x.type === 'gasto').map(x => x.cat))];
  const rows = [row('ingreso'), row('gasto'), ...cats.map(c => row('gasto', c))];
  const alerts = rows.filter(r => r.cat && r.diff > 0 && (r.pct === Infinity || r.pct >= threshold));
  const saved = rows[1].prev && rows[1].cur < rows[1].prev ? round2(rows[1].prev - rows[1].cur) : 0;
  return { prevMonth: p, rows, alerts, saved };
}

export function budgetStatus(tx, budgets, m){
  const exp = inMonth(tx, m).filter(x => x.type === 'gasto');
  const items = Object.entries(budgets).map(([cat, limit]) => {
    const spent = sumOf(exp, 'gasto', cat), pct = limit ? spent/limit*100 : 0;
    return { cat, limit, spent, pct, left: round2(limit - spent), level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
  });
  const limit = sum(items, i => i.limit), spent = sum(items, i => i.spent);
  return { items, limit, spent, pct: limit ? Math.round(spent/limit*100) : null };
}

// Cuánto ahorrar al mes para llegar a la meta a tiempo
export function goalPlan(goal, curMonth){
  const pct = Math.min(100, goal.saved/goal.target*100), left = Math.max(0, round2(goal.target - goal.saved));
  const months = monthsUntil(curMonth, goal.deadline);
  const status = left === 0 ? 'done' : months <= 0 ? 'overdue' : 'active';
  return { pct, left, months, status, perMonth: status === 'active' ? round2(left/months) : 0 };
}

// Periodo: mes ('month'), rango ('from'/'to') o todo ('all'). Texto que empieza con # busca por etiqueta
export function filterTx(tx, { month, cat, type, q, all, from, to, account }){
  q = (q || '').trim().toLowerCase();
  const tag = q.startsWith('#') ? q.slice(1) : null;
  const inPeriod = x => all || (from || to ? (!from || x.date >= from) && (!to || x.date <= to) : x.date.startsWith(month));
  const matches = x => !q || (tag !== null ? (x.tags || []).some(t => t.startsWith(tag))
    : [x.desc, x.note, x.sub, ...(x.tags || [])].join(' ').toLowerCase().includes(q));
  return tx.filter(x => inPeriod(x) && (!cat || x.cat === cat) && (!type || x.type === type) &&
    (!account || x.account === account || x.to === account) && matches(x)
  ).sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
}

// Agrupa movimientos ya ordenados por día con el neto de cada día
export function groupByDay(list){
  const days = [];
  list.forEach(x => {
    let d = days[days.length - 1];
    if (!d || d.date !== x.date) days.push(d = { date: x.date, net: 0, items: [] });
    d.items.push(x); d.net = round2(d.net + signed(x));
  });
  return days;
}

export const netOf = list => sum(list, signed);

export const chartSeries = (tx, m, n = 6) => lastMonths(m, n).map(mm => {
  const s = monthSummary(tx, mm); return { m: mm, inc: s.inc, exp: s.exp };
});

// Cambia el nombre de una categoría en todos los lugares donde se usa (modifica 'state')
export function renameCategory(state, type, from, to){
  const i = state.cats[type].indexOf(from);
  if (i < 0) return state;
  state.cats[type][i] = to;
  state.tx.forEach(x => { if (x.cat === from && x.type === type) x.cat = to; });
  state.recurring.forEach(r => { if (r.cat === from && r.type === type) r.cat = to; });
  if (from in state.budgets) { state.budgets[to] = state.budgets[from]; delete state.budgets[from]; }
  if (state.subcats?.[from]) { state.subcats[to] = state.subcats[from]; delete state.subcats[from]; }
  return state;
}

// Escala "bonita" para el eje: 4 divisiones de 1, 2, 2.5 o 5 x 10^n
export function niceScale(maxValue, ticks = 4){
  const raw = Math.max(1, maxValue) / ticks, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(k => k*mag).find(s => s >= raw);
  return { step, max: step * ticks };
}
