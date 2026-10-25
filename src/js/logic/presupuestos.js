// Presupuestos con historial. Los límites se guardan como "planes" que rigen desde un mes:
//   budgetPlans = [{ from: '0000-01', limits: { Alimentación: 3500 } }, { from: '2026-11', limits: { ... } }]
// El límite de un mes es el del plan más reciente que empezó en o antes de ese mes. Así cambiar un límite
// en noviembre no altera octubre, y diciembre hereda lo de noviembre si no se cambia nada.
import { addMonths } from './fechas.js';
import { budgetStatus } from './calculos.js';

export const SIEMPRE = '0000-01'; // plan sin fecha de inicio (los límites anteriores al historial)

const sortPlans = plans => [...plans].sort((a, b) => a.from.localeCompare(b.from));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// Límites que rigen en el mes 'm' (copia, se puede modificar sin afectar los planes)
export function effectiveBudgets(plans, m) {
  const plan = sortPlans(plans || [])
    .filter(p => p.from <= m)
    .pop();
  return plan ? { ...plan.limits } : {};
}

// Mes desde el que rigen los límites de 'm' (null si no hay ninguno)
export const planStart = (plans, m) =>
  sortPlans(plans || [])
    .filter(p => p.from <= m)
    .pop()?.from ?? null;

// Quita planes que repiten exactamente los límites del anterior, y planes vacíos al inicio
export function normalize(plans) {
  const out = [];
  for (const p of sortPlans(plans)) {
    const prev = out[out.length - 1];
    if (prev ? same(prev.limits, p.limits) : !Object.keys(p.limits).length) continue;
    out.push({ from: p.from, limits: { ...p.limits } });
  }
  return out;
}

// Reemplaza los límites que rigen desde 'm' (los meses anteriores no cambian; los posteriores con
// plan propio tampoco). Devuelve planes nuevos
export function setPlan(plans, m, limits) {
  const rest = (plans || []).filter(p => p.from !== m);
  return normalize([...rest, { from: m, limits: { ...limits } }]);
}

// Cambia o quita (limit = null) el límite de una categoría desde el mes 'm'
export function setLimit(plans, m, cat, limit) {
  const limits = effectiveBudgets(plans, m);
  if (limit === null) delete limits[cat];
  else limits[cat] = limit;
  return setPlan(plans, m, limits);
}

// El mes siguiente usa exactamente los límites de 'm'
export const copyToNextMonth = (plans, m) => setPlan(plans, addMonths(m, 1), effectiveBudgets(plans, m));

// ¿El mes siguiente tiene límites distintos a los de 'm'?
export const nextMonthDiffers = (plans, m) => !same(effectiveBudgets(plans, m), effectiveBudgets(plans, addMonths(m, 1)));

// Renombra o elimina una categoría en todos los planes
export const renameInPlans = (plans, from, to) =>
  normalize(
    (plans || []).map(p => {
      const limits = { ...p.limits };
      if (from in limits) {
        if (to) limits[to] = limits[from];
        delete limits[from];
      }
      return { from: p.from, limits };
    })
  );

// Convierte el formato anterior (un solo objeto de límites para todos los meses)
export const fromLegacy = budgets => (budgets && Object.keys(budgets).length ? [{ from: SIEMPRE, limits: { ...budgets } }] : []);

// Historial: por cada mes, el estado de cada categoría con los límites que regían ese mes
// Los meses sin ningún movimiento registrado (p. ej. antes de empezar a usar la app) no cuentan:
// mostrarían "0% en orden" sin que haya nada que evaluar
export function budgetHistory(tx, plans, months) {
  const rows = months.map(m => {
    if (!tx.some(x => x.date.startsWith(m))) return { m, items: [], limit: 0, spent: 0, pct: null, over: 0, noData: true };
    const s = budgetStatus(tx, effectiveBudgets(plans, m), m);
    return { m, ...s, over: s.items.filter(i => i.level === 'over').length };
  });
  const cats = [...new Set(rows.flatMap(r => r.items.map(i => i.cat)))];
  // Por categoría: cuántos meses con límite se pasó y la racha actual de meses dentro del límite
  const byCat = cats.map(cat => {
    const cells = rows.map(r => r.items.find(i => i.cat === cat) || null);
    const withLimit = cells.filter(Boolean);
    let streak = 0;
    for (let i = cells.length - 1; i >= 0 && cells[i] && cells[i].level !== 'over'; i--) streak++;
    return { cat, cells, overMonths: withLimit.filter(c => c.level === 'over').length, months: withLimit.length, streak };
  });
  return { rows, byCat };
}
