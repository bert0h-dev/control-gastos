import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, isEmpty, readState, writeState } from '../server/db.js';
import { ensureUniqueIds } from '../server/api.js';
import { migrate } from '../src/js/logic/cuentas.js';
import { DEFAULT } from '../src/js/logic/estado.js';

const sample = () =>
  migrate({
    ...structuredClone(DEFAULT),
    accounts: [
      { id: 'efectivo', name: 'Efectivo', kind: 'efectivo', initial: 150.5 },
      { id: 'tc', name: 'Visa', kind: 'credito', initial: -1200, limit: 30000, cutDay: 20, payDay: 10 },
    ],
    tx: [
      {
        id: 1,
        type: 'gasto',
        date: '2026-10-01',
        desc: 'Súper "grande"',
        amount: 0.1,
        account: 'efectivo',
        cat: 'Alimentación',
        sub: 'Súper',
        tags: ['casa', 'semanal'],
        note: '',
      },
      {
        id: 2,
        type: 'gasto',
        date: '2026-10-02',
        desc: 'Centavos',
        amount: 0.2,
        account: 'tc',
        cat: 'Otros',
        note: 'nota',
        recId: 9,
        method: 'Tarjeta de crédito',
      },
      { id: 3, type: 'transferencia', date: '2026-10-03', desc: 'Pago', amount: 1234.56, account: 'efectivo', to: 'tc', note: '' },
    ],
    recurring: [
      {
        id: 9,
        type: 'gasto',
        desc: 'Netflix',
        amount: 299,
        cat: 'Otros',
        account: 'tc',
        method: '',
        day: 15,
        start: '2026-01',
        lastGen: '2026-09',
        active: true,
      },
    ],
    budgets: { Alimentación: 3500.75, Otros: 100 },
    goals: [{ id: 5, name: 'Viaje', target: 20000, saved: 850.25, deadline: '2027-03' }],
    subcats: { Alimentación: ['Súper', 'Restaurantes'] },
    theme: 'dark',
  });

describe('base de datos SQLite', () => {
  let db;
  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('empieza vacía', () => {
    expect(isEmpty(db)).toBe(true);
  });

  it('lo que se guarda se lee idéntico', () => {
    const s = sample();
    writeState(db, s);
    expect(isEmpty(db)).toBe(false);
    expect(readState(db)).toEqual(s);
  });

  it('guarda los montos en centavos exactos', () => {
    writeState(db, sample());
    const cents = db
      .prepare('SELECT amount_cents FROM transactions ORDER BY id')
      .all()
      .map(r => r.amount_cents);
    expect(cents).toEqual([10, 20, 123456]);
    expect(readState(db).tx[0].amount + readState(db).tx[1].amount).toBeCloseTo(0.3, 10);
  });

  it('guardar de nuevo reemplaza todo (no duplica)', () => {
    writeState(db, sample());
    const s = sample();
    s.tx = s.tx.slice(0, 1);
    s.goals = [];
    writeState(db, s);
    expect(readState(db).tx).toHaveLength(1);
    expect(readState(db).goals).toEqual([]);
  });

  it('si algo falla a medio guardar, no cambia nada', () => {
    writeState(db, sample());
    const bad = sample();
    bad.tx.push({ ...bad.tx[0] }); // id repetido -> viola la llave primaria
    expect(() => writeState(db, bad)).toThrow();
    expect(readState(db)).toEqual(sample());
  });
});

describe('ids repetidos', () => {
  it('reasigna ids duplicados o inválidos sin tocar los demás', () => {
    const list = ensureUniqueIds([{ id: 5 }, { id: 5 }, { id: 'x' }, { id: 7 }]);
    expect(list.map(x => x.id)).toEqual([5, 8, 9, 7]);
  });
});
