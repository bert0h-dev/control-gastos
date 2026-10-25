import { describe, it, expect } from 'vitest';
import { sum, monthSummary, expensesByCategory, dailyAverage, compareMonths, budgetStatus, goalPlan, filterTx, groupByDay, netOf, niceScale, renameCategory } from '../src/js/logic/calculos.js';

let id = 0;
const t = (date, type, amount, cat = 'Otros', desc = 'x', note = '') => ({ id: ++id, date, type, amount, cat, desc, note });
const tx = [
  t('2026-09-01', 'ingreso', 20000, 'Salario'),
  t('2026-09-05', 'gasto', 3000, 'Alimentación'),
  t('2026-09-10', 'gasto', 1000, 'Entretenimiento'),
  t('2026-10-01', 'ingreso', 20000, 'Salario'),
  t('2026-10-05', 'gasto', 2500, 'Alimentación', 'Súper', 'semanal'),
  t('2026-10-05', 'gasto', 2000, 'Entretenimiento', 'Concierto'),
  t('2026-10-08', 'gasto', 500, 'Salud', 'Farmacia'),
];

describe('dinero', () => {
  it('suma sin errores de punto flotante', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(sum([19.99, 0.01, 10.1])).toBe(30.1);
  });
});

describe('resumen del mes', () => {
  it('calcula ingresos, gastos, balance y tasa de ahorro', () => {
    expect(monthSummary(tx, '2026-10')).toEqual({ count: 4, inc: 20000, exp: 5000, bal: 15000, rate: 75 });
  });
  it('sin ingresos la tasa de ahorro es null', () => {
    expect(monthSummary([t('2026-10-01', 'gasto', 10)], '2026-10').rate).toBeNull();
  });
  it('ordena gastos por categoría con porcentaje', () => {
    expect(expensesByCategory(tx, '2026-10')).toEqual([
      { cat: 'Alimentación', amount: 2500, pct: 50 },
      { cat: 'Entretenimiento', amount: 2000, pct: 40 },
      { cat: 'Salud', amount: 500, pct: 10 },
    ]);
  });
  it('promedia el gasto diario con los días transcurridos del mes actual', () => {
    expect(dailyAverage(tx, '2026-10', '2026-10-10')).toMatchObject({ avg: 500, days: 10, left: 21, isCur: true });
    expect(dailyAverage(tx, '2026-09', '2026-10-10')).toMatchObject({ days: 30, isCur: false });
  });
});

describe('comparativo', () => {
  const c = compareMonths(tx, '2026-10');
  it('compara contra el mes anterior', () => {
    expect(c.prevMonth).toBe('2026-09');
    const ent = c.rows.find(r => r.cat === 'Entretenimiento');
    expect(ent).toMatchObject({ prev: 1000, cur: 2000, diff: 1000, pct: 100, good: false });
  });
  it('una categoría nueva tiene pct Infinity y genera alerta', () => {
    expect(c.rows.find(r => r.cat === 'Salud').pct).toBe(Infinity);
    expect(c.alerts.map(a => a.cat)).toEqual(['Entretenimiento', 'Salud']);
  });
  it('bajar el gasto en una categoría es bueno y no alerta', () => {
    expect(c.rows.find(r => r.cat === 'Alimentación')).toMatchObject({ diff: -500, good: true });
  });
  it('reporta ahorro cuando el gasto total baja', () => {
    expect(c.saved).toBe(0); // octubre 5000 vs septiembre 4000: subió
    expect(compareMonths(tx, '2026-11').saved).toBe(5000); // noviembre sin gastos vs octubre 5000
  });
});

describe('presupuestos', () => {
  it('calcula nivel y disponible por categoría', () => {
    const b = budgetStatus(tx, { 'Alimentación': 4000, 'Entretenimiento': 2000, 'Salud': 400 }, '2026-10');
    expect(b.items.map(i => i.level)).toEqual(['ok', 'over', 'over']);
    expect(b.items[0]).toMatchObject({ spent: 2500, left: 1500 });
    expect(b.items[2].left).toBe(-100);
    expect(b).toMatchObject({ limit: 6400, spent: 5000, pct: 78 });
  });
  it('80% o más es advertencia', () => {
    expect(budgetStatus(tx, { 'Alimentación': 3100 }, '2026-10').items[0].level).toBe('warn');
  });
});

describe('metas', () => {
  it('calcula el ahorro mensual necesario', () => {
    expect(goalPlan({ target: 20000, saved: 8000, deadline: '2027-01' }, '2026-10')).toMatchObject({ left: 12000, months: 4, perMonth: 3000, status: 'active', pct: 40 });
  });
  it('detecta meta cumplida y vencida', () => {
    expect(goalPlan({ target: 100, saved: 150, deadline: '2026-01' }, '2026-10')).toMatchObject({ status: 'done', pct: 100, left: 0 });
    expect(goalPlan({ target: 100, saved: 20, deadline: '2026-09' }, '2026-10').status).toBe('overdue');
  });
});

describe('movimientos', () => {
  it('filtra por mes, categoría, tipo y texto (en descripción o nota)', () => {
    expect(filterTx(tx, { month: '2026-10' })).toHaveLength(4);
    expect(filterTx(tx, { all: true, cat: 'Salario' })).toHaveLength(2);
    expect(filterTx(tx, { month: '2026-10', type: 'ingreso' })).toHaveLength(1);
    expect(filterTx(tx, { month: '2026-10', q: 'SEMANAL' })[0].desc).toBe('Súper');
  });
  it('ordena del más reciente al más antiguo', () => {
    const dates = filterTx(tx, { all: true }).map(x => x.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
  it('agrupa por día con el neto de cada día', () => {
    const days = groupByDay(filterTx(tx, { month: '2026-10' }));
    expect(days.map(d => [d.date, d.net, d.items.length])).toEqual([
      ['2026-10-08', -500, 1], ['2026-10-05', -4500, 2], ['2026-10-01', 20000, 1],
    ]);
    expect(netOf(filterTx(tx, { month: '2026-10' }))).toBe(15000);
  });
});

describe('renombrar categoría', () => {
  it('actualiza movimientos, recurrentes, presupuesto y subcategorías', () => {
    const s = {
      cats: { gasto: ['Comida', 'Otros'], ingreso: ['Comida'] },
      tx: [{ type: 'gasto', cat: 'Comida' }, { type: 'gasto', cat: 'Otros' }, { type: 'ingreso', cat: 'Comida' }],
      recurring: [{ type: 'gasto', cat: 'Comida' }],
      budgets: { Comida: 3000 }, subcats: { Comida: ['Súper'] },
    };
    renameCategory(s, 'gasto', 'Comida', 'Alimentación');
    expect(s.cats.gasto).toEqual(['Alimentación', 'Otros']);
    expect(s.tx.map(x => x.cat)).toEqual(['Alimentación', 'Otros', 'Comida']); // el ingreso con el mismo nombre no cambia
    expect(s.recurring[0].cat).toBe('Alimentación');
    expect(s.budgets).toEqual({ Alimentación: 3000 });
    expect(s.subcats).toEqual({ Alimentación: ['Súper'] });
  });
});

describe('escala de la gráfica', () => {
  it('redondea a pasos legibles', () => {
    expect(niceScale(34500)).toEqual({ step: 10000, max: 40000 });
    expect(niceScale(9000)).toEqual({ step: 2500, max: 10000 });
    expect(niceScale(0)).toEqual({ step: 0.25, max: 1 });
  });
});
