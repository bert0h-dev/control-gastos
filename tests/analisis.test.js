import { describe, it, expect } from 'vitest';
import { projectMonth, rangeSummary, balanceSeries, dailySpend, parseTags, presetRange } from '../src/js/logic/analisis.js';

let id = 0;
const t = (date, type, amount, extra = {}) => ({ id: ++id, date, type, amount, cat: 'Otros', desc: 'x', ...extra });

describe('proyección de fin de mes', () => {
  const tx = [
    t('2026-10-01', 'ingreso', 20000, { recId: 1 }),
    t('2026-10-02', 'gasto', 9000, { recId: 2 }),     // renta (fija)
    t('2026-10-05', 'gasto', 1000),
    t('2026-10-09', 'gasto', 1000),
  ];
  const recurring = [
    { id: 2, type: 'gasto', amount: 9000, day: 2, start: '2026-01', lastGen: '2026-10', active: true },
    { id: 3, type: 'gasto', amount: 300, day: 15, start: '2026-01', lastGen: '2026-09', active: true },  // Netflix pendiente
    { id: 4, type: 'gasto', amount: 999, day: 20, start: '2026-01', lastGen: '2026-09', active: false }, // pausado
  ];
  it('extrapola el gasto variable y suma los recurrentes que faltan', () => {
    const p = projectMonth(tx, recurring, '2026-10', '2026-10-10');
    // variable 2000 en 10 días -> 6200 en 31 días; + 9000 fijos + 300 pendientes
    expect(p).toMatchObject({ isCur: true, variable: 2000, fixedExp: 9000, pendExp: 300, projExp: 15500, projInc: 20000, projBal: 4500 });
  });
  it('en meses pasados la proyección es lo real', () => {
    expect(projectMonth(tx, recurring, '2026-10', '2026-11-03')).toMatchObject({ isCur: false, projExp: 11000, projInc: 20000 });
  });
});

describe('rangos', () => {
  const tx = [
    t('2026-08-10', 'gasto', 1000, { cat: 'Comida', sub: 'Restaurantes', tags: ['viaje'] }),
    t('2026-09-10', 'gasto', 3000, { cat: 'Comida', sub: 'Súper' }),
    t('2026-09-12', 'ingreso', 9000),
    t('2026-10-01', 'gasto', 2000, { cat: 'Transporte', tags: ['viaje', 'trabajo'] }),
    t('2026-10-02', 'transferencia', 5000, { account: 'a', to: 'b' }),
  ];
  it('suma el rango y promedia por mes sin contar transferencias', () => {
    const r = rangeSummary(tx, '2026-08-01', '2026-10-31');
    expect(r).toMatchObject({ inc: 9000, exp: 6000, net: 3000, months: 3, avgExp: 2000 });
  });
  it('desglosa por categoría, subcategoría y etiqueta', () => {
    const r = rangeSummary(tx, '2026-08-01', '2026-10-31');
    expect(r.byCat).toEqual([{ name: 'Comida', amount: 4000, pct: 67 }, { name: 'Transporte', amount: 2000, pct: 33 }]);
    expect(r.bySub.map(s => s.name)).toEqual(['Comida › Súper', 'Comida › Restaurantes']);
    expect(r.byTag).toEqual([{ name: 'viaje', amount: 3000, pct: 50 }, { name: 'trabajo', amount: 2000, pct: 33 }]);
  });
  it('arma la serie de balance acumulado', () => {
    expect(balanceSeries(tx, '2026-08', '2026-10')).toEqual([
      { m: '2026-08', net: -1000, acc: -1000 }, { m: '2026-09', net: 6000, acc: 5000 }, { m: '2026-10', net: -2000, acc: 3000 },
    ]);
  });
  it('calcula presets de rango', () => {
    expect(presetRange('3m', '2026-10')).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(presetRange('year', '2026-02')).toEqual({ from: '2026-01-01', to: '2026-02-28' });
  });
});

describe('calendario', () => {
  it('acumula el gasto por día', () => {
    const d = dailySpend([t('2026-02-03', 'gasto', 100), t('2026-02-03', 'gasto', 50), t('2026-02-03', 'ingreso', 999)], '2026-02');
    expect(d).toHaveLength(28);
    expect(d[2]).toMatchObject({ day: 3, amount: 150, count: 2 });
  });
});

describe('etiquetas', () => {
  it('normaliza etiquetas escritas con # o con comas', () => {
    expect(parseTags('#Viaje Cancún #cumple #cumple')).toEqual(['viaje-cancún', 'cumple']);
    expect(parseTags('trabajo, Comida rápida')).toEqual(['trabajo', 'comida-rápida']);
    expect(parseTags('')).toEqual([]);
  });
});
