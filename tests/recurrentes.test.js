import { describe, it, expect } from 'vitest';
import { generatePending, resume, monthlyNet } from '../src/js/logic/recurrentes.js';

const ids = () => {
  let n = 0;
  return () => ++n;
};
const rec = o => ({
  id: 1,
  type: 'gasto',
  desc: 'Renta',
  amount: 9500,
  cat: 'Vivienda',
  method: 'Transferencia',
  day: 5,
  start: '2026-08',
  lastGen: null,
  active: true,
  ...o,
});

describe('recurrentes', () => {
  it('genera todos los meses pendientes desde el inicio', () => {
    const r = rec();
    const out = generatePending([r], '2026-10-25', ids());
    expect(out.map(x => x.date)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(r.lastGen).toBe('2026-10');
    expect(out[0]).toMatchObject({ amount: 9500, recId: 1, note: 'Recurrente' });
  });

  it('no genera el mes actual si el día aún no llega', () => {
    const r = rec({ day: 28 });
    expect(generatePending([r], '2026-10-25', ids()).map(x => x.date)).toEqual(['2026-08-28', '2026-09-28']);
    expect(r.lastGen).toBe('2026-09');
  });

  it('no duplica al correr dos veces', () => {
    const r = rec();
    generatePending([r], '2026-10-25', ids());
    expect(generatePending([r], '2026-10-25', ids())).toHaveLength(0);
  });

  it('el día 31 cae en el último día de meses cortos', () => {
    const r = rec({ day: 31, start: '2027-01' });
    expect(generatePending([r], '2027-04-30', ids()).map(x => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('cruza el cambio de año', () => {
    const r = rec({ start: '2026-11' });
    expect(generatePending([r], '2027-02-10', ids()).map(x => x.date)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05']);
  });

  it('ignora los pausados y al reanudar no cobra los meses en pausa', () => {
    const r = rec({ lastGen: '2026-05', active: false });
    expect(generatePending([r], '2026-10-25', ids())).toHaveLength(0);
    resume(r, '2026-10-25');
    expect(generatePending([r], '2026-10-25', ids()).map(x => x.date)).toEqual(['2026-10-05']);
  });

  it('calcula el neto mensual de los activos', () => {
    expect(monthlyNet([rec(), rec({ type: 'ingreso', amount: 28000 }), rec({ amount: 299.9, active: false })])).toBe(18500);
  });
});
