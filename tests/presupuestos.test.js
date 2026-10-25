import { describe, it, expect } from 'vitest';
import {
  SIEMPRE,
  effectiveBudgets,
  planStart,
  setLimit,
  setPlan,
  copyToNextMonth,
  nextMonthDiffers,
  renameInPlans,
  fromLegacy,
  normalize,
  budgetHistory,
} from '../src/js/logic/presupuestos.js';

const legacy = fromLegacy({ Comida: 3000, Ocio: 1000 });

describe('límites por mes', () => {
  it('convierte el formato anterior en límites vigentes desde siempre', () => {
    expect(legacy).toEqual([{ from: SIEMPRE, limits: { Comida: 3000, Ocio: 1000 } }]);
    expect(fromLegacy({})).toEqual([]);
    expect(effectiveBudgets(legacy, '1999-01')).toEqual({ Comida: 3000, Ocio: 1000 });
  });

  it('cambiar un límite en un mes no altera los anteriores y se hereda en los siguientes', () => {
    const plans = setLimit(legacy, '2026-11', 'Comida', 3500);
    expect(effectiveBudgets(plans, '2026-10').Comida).toBe(3000);
    expect(effectiveBudgets(plans, '2026-11').Comida).toBe(3500);
    expect(effectiveBudgets(plans, '2027-03').Comida).toBe(3500);
    expect(effectiveBudgets(plans, '2026-11').Ocio).toBe(1000); // lo demás se conserva
    expect(planStart(plans, '2027-03')).toBe('2026-11');
    expect(planStart(plans, '2026-10')).toBe(SIEMPRE);
  });

  it('un mes con plan propio no cambia al editar un mes anterior', () => {
    let plans = setLimit(legacy, '2026-12', 'Comida', 4000);
    plans = setLimit(plans, '2026-10', 'Comida', 2000);
    expect(effectiveBudgets(plans, '2026-10').Comida).toBe(2000);
    expect(effectiveBudgets(plans, '2026-11').Comida).toBe(2000);
    expect(effectiveBudgets(plans, '2026-12').Comida).toBe(4000);
  });

  it('quitar un límite desde un mes lo conserva en los anteriores', () => {
    const plans = setLimit(legacy, '2026-11', 'Ocio', null);
    expect(effectiveBudgets(plans, '2026-10')).toHaveProperty('Ocio');
    expect(effectiveBudgets(plans, '2026-11')).not.toHaveProperty('Ocio');
  });

  it('volver al mismo valor no deja planes repetidos', () => {
    let plans = setLimit(legacy, '2026-11', 'Comida', 3500);
    plans = setLimit(plans, '2026-11', 'Comida', 3000);
    expect(plans).toEqual(legacy);
  });

  it('copiar al mes siguiente iguala sus límites', () => {
    let plans = setLimit(legacy, '2026-11', 'Comida', 9999); // noviembre distinto
    expect(nextMonthDiffers(plans, '2026-10')).toBe(true);
    plans = copyToNextMonth(plans, '2026-10');
    expect(effectiveBudgets(plans, '2026-11')).toEqual(effectiveBudgets(plans, '2026-10'));
    expect(nextMonthDiffers(plans, '2026-10')).toBe(false);
  });

  it('renombra o elimina una categoría en todos los planes', () => {
    let plans = setLimit(legacy, '2026-11', 'Comida', 3500);
    plans = renameInPlans(plans, 'Comida', 'Alimentación');
    expect(effectiveBudgets(plans, '2026-10')).toEqual({ Alimentación: 3000, Ocio: 1000 });
    expect(effectiveBudgets(plans, '2026-11').Alimentación).toBe(3500);
    plans = renameInPlans(plans, 'Ocio', null);
    expect(effectiveBudgets(plans, '2026-11')).toEqual({ Alimentación: 3500 });
  });

  it('normaliza: ordena, quita duplicados consecutivos y planes vacíos al inicio', () => {
    const plans = normalize([
      { from: '2026-12', limits: { A: 1 } },
      { from: '2026-01', limits: {} },
      { from: '2026-11', limits: { A: 1 } },
    ]);
    expect(plans).toEqual([{ from: '2026-11', limits: { A: 1 } }]);
  });

  it('setPlan sin límites desde un mes deja ese mes sin presupuesto', () => {
    const plans = setPlan(legacy, '2027-01', {});
    expect(effectiveBudgets(plans, '2027-02')).toEqual({});
    expect(effectiveBudgets(plans, '2026-12')).toEqual({ Comida: 3000, Ocio: 1000 });
  });
});

describe('historial', () => {
  let id = 0;
  const g = (date, cat, amount) => ({ id: ++id, type: 'gasto', date, cat, amount });
  const tx = [
    g('2026-08-05', 'Comida', 3500),
    g('2026-09-05', 'Comida', 2500),
    g('2026-10-05', 'Comida', 3200),
    g('2026-10-06', 'Ocio', 200),
  ];
  // Desde octubre Comida sube a 3500: con ese límite octubre ya no se excede
  const plans = setLimit(legacy, '2026-10', 'Comida', 3500);

  it('evalúa cada mes con los límites que regían entonces', () => {
    const h = budgetHistory(tx, plans, ['2026-08', '2026-09', '2026-10']);
    const comida = h.byCat.find(c => c.cat === 'Comida');
    expect(comida.cells.map(c => [c.limit, c.spent, c.level])).toEqual([
      [3000, 3500, 'over'],
      [3000, 2500, 'warn'],
      [3500, 3200, 'warn'],
    ]);
    expect(comida).toMatchObject({ overMonths: 1, months: 3, streak: 2 });
    expect(h.rows.map(r => r.over)).toEqual([1, 0, 0]);
  });

  it('los meses sin ningún movimiento no cuentan como cumplidos', () => {
    const h = budgetHistory(tx, plans, ['2026-06', '2026-07', '2026-08']);
    expect(h.rows.map(r => !!r.noData)).toEqual([true, true, false]);
    const comida = h.byCat.find(c => c.cat === 'Comida');
    expect(comida.cells.slice(0, 2)).toEqual([null, null]);
    expect(comida.months).toBe(1);
  });

  it('una categoría sin límite en un mes queda vacía ese mes', () => {
    const p = setLimit(fromLegacy({ Comida: 3000 }), '2026-10', 'Ocio', 500);
    const h = budgetHistory(tx, p, ['2026-09', '2026-10']);
    const ocio = h.byCat.find(c => c.cat === 'Ocio');
    expect(ocio.cells[0]).toBeNull();
    expect(ocio.cells[1]).toMatchObject({ limit: 500, spent: 200, level: 'ok' });
    expect(ocio.months).toBe(1);
  });
});
