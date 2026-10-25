import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, isEmpty, readState, writeState, applyDelta, getVersion } from '../server/db.js';
import { ensureUniqueIds, sanitizeChanges } from '../server/api.js';
import { diffState, applyChanges } from '../src/js/logic/sync.js';
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
    bad.tx.push({ ...bad.tx[0], id: 99, amount: 0 }); // monto 0 -> viola el CHECK de la tabla
    expect(() => writeState(db, bad)).toThrow();
    expect(readState(db)).toEqual(sample());
  });
});

describe('cambios por fila (fase 2)', () => {
  let db;
  beforeEach(() => {
    db = openDb(':memory:');
    writeState(db, sample());
  });

  it('cada escritura sube la versión', () => {
    expect(getVersion(db)).toBe(1);
    applyDelta(db, { tx: { upsert: [], delete: [3] } });
    expect(getVersion(db)).toBe(2);
    writeState(db, sample());
    expect(getVersion(db)).toBe(3);
  });

  it('aplica altas, ediciones y bajas sin tocar lo demás', () => {
    const s = sample();
    const edited = { ...s.tx[0], amount: 999.99, tags: ['nueva'] };
    const added = { id: 50, type: 'ingreso', date: '2026-10-09', desc: 'Pago', amount: 10, account: 'efectivo', cat: 'Salario', note: '' };
    applyDelta(db, { tx: { upsert: [edited, added], delete: [2] }, goals: { upsert: [], delete: [5] } });
    const r = readState(db);
    expect(r.tx.map(x => x.id)).toEqual([1, 3, 50]);
    expect(r.tx[0]).toMatchObject({ amount: 999.99, tags: ['nueva'] });
    expect(r.goals).toEqual([]);
    expect(r.recurring).toEqual(s.recurring);
    expect(r.accounts).toEqual(s.accounts);
  });

  it('el resultado es el mismo que aplicar el diff en memoria', () => {
    const s = sample(),
      next = structuredClone(s);
    next.tx[1].desc = 'Editado';
    next.tx.push({ id: 77, type: 'gasto', date: '2026-10-20', desc: 'Nuevo', amount: 5, account: 'tc', cat: 'Otros', note: '' });
    next.budgets = { Otros: 50 };
    next.palette = 'grafito';
    next.accounts.reverse();
    applyDelta(db, diffState(s, next));
    expect(readState(db)).toEqual(applyChanges(s, diffState(s, next)));
  });

  it('si un cambio falla, no se aplica ninguno', () => {
    const before = readState(db);
    const bad = { id: 60, type: 'gasto', date: '2026-10-01', desc: 'x', amount: 0, account: 'efectivo', cat: 'Otros', note: '' }; // monto 0 viola el CHECK
    expect(() => applyDelta(db, { tx: { upsert: [bad], delete: [1] } })).toThrow();
    expect(readState(db)).toEqual(before);
    expect(getVersion(db)).toBe(1);
  });
});

describe('presupuestos del formato anterior', () => {
  it('una base con la tabla budgets (sin historial) se lee como límites vigentes desde siempre', () => {
    const db = openDb(':memory:');
    db.exec("INSERT INTO budgets VALUES ('Comida', 0, 350000), ('Ocio', 1, 100050)");
    db.exec("INSERT INTO settings VALUES ('saved', '2026-10-01T00:00:00Z')");
    expect(readState(db).budgetPlans).toEqual([{ from: '0000-01', limits: { Comida: 3500, Ocio: 1000.5 } }]);
    // Al guardar de nuevo, queda en el formato nuevo y la tabla anterior se vacía
    writeState(db, migrate({ ...structuredClone(DEFAULT), budgetPlans: readState(db).budgetPlans }));
    expect(db.prepare('SELECT COUNT(*) n FROM budgets').get().n).toBe(0);
    expect(readState(db).budgetPlans).toEqual([{ from: '0000-01', limits: { Comida: 3500, Ocio: 1000.5 } }]);
  });
});

describe('validación de cambios', () => {
  it('descarta movimientos inválidos y ids no numéricos', () => {
    const c = sanitizeChanges({
      tx: {
        upsert: [
          { id: 1, type: 'gasto', date: '2026-10-01', desc: 'ok', amount: 5, account: 'banco' },
          { id: 2, date: 'ayer', amount: 5 },
          { id: 'x', date: '2026-10-01', amount: 5 },
          { id: 3, type: 'transferencia', date: '2026-10-01', amount: 5, account: 'banco', to: 'banco' },
        ],
        delete: [4, 'DROP TABLE', null],
      },
    });
    expect(c.tx.upsert.map(x => x.id)).toEqual([1]);
    expect(c.tx.delete).toEqual([4]);
  });

  it('no permite quedarse sin cuentas', () => {
    expect(() => sanitizeChanges({ accounts: [] })).toThrow(/al menos una cuenta/);
  });

  it('rechaza cuerpos que no son un objeto de cambios', () => {
    expect(() => sanitizeChanges(null)).toThrow();
    expect(() => sanitizeChanges([1, 2])).toThrow();
  });
});

describe('ids repetidos', () => {
  it('reasigna ids duplicados o inválidos sin tocar los demás', () => {
    const list = ensureUniqueIds([{ id: 5 }, { id: 5 }, { id: 'x' }, { id: 7 }]);
    expect(list.map(x => x.id)).toEqual([5, 8, 9, 7]);
  });
});
