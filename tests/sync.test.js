import { describe, it, expect } from 'vitest';
import { diffState, applyChanges, rebase, isEmptyChanges, countChanges } from '../src/js/logic/sync.js';

const base = () => ({
  tx: [
    { id: 1, type: 'gasto', desc: 'Súper', amount: 100 },
    { id: 2, type: 'gasto', desc: 'Taxi', amount: 50 },
  ],
  recurring: [{ id: 10, desc: 'Renta', amount: 9000 }],
  goals: [],
  accounts: [{ id: 'banco', name: 'Banco' }],
  cats: { gasto: ['Comida'], ingreso: ['Salario'] },
  subcats: {},
  budgetPlans: [{ from: '0000-01', limits: { Comida: 3000 } }],
  theme: null,
  palette: 'esmeralda',
});

describe('diffState', () => {
  it('sin cambios no hay nada que enviar', () => {
    expect(isEmptyChanges(diffState(base(), base()))).toBe(true);
  });

  it('detecta altas, ediciones y bajas por id', () => {
    const next = base();
    next.tx[0].amount = 120; // edición
    next.tx.splice(1, 1); // baja
    next.tx.push({ id: 3, type: 'ingreso', desc: 'Pago', amount: 500 }); // alta
    const c = diffState(base(), next);
    expect(c.tx.upsert.map(x => x.id)).toEqual([1, 3]);
    expect(c.tx.delete).toEqual([2]);
    expect(c.recurring).toBeUndefined();
    expect(countChanges(c)).toEqual({ tx: 3 });
  });

  it('envía bloques completos solo si cambian', () => {
    const next = base();
    next.budgetPlans[0].limits.Comida = 3500;
    next.palette = 'oceano';
    const c = diffState(base(), next);
    expect(c.budgetPlans).toEqual([{ from: '0000-01', limits: { Comida: 3500 } }]);
    expect(c.settings).toEqual({ theme: null, palette: 'oceano' });
    expect(c.accounts).toBeUndefined();
  });

  it('el orden de los movimientos no cuenta como cambio', () => {
    const next = base();
    next.tx.reverse();
    expect(isEmptyChanges(diffState(base(), next))).toBe(true);
  });
});

describe('applyChanges', () => {
  it('aplicar el diff reproduce el estado destino', () => {
    const next = base();
    next.tx[0].desc = 'Supermercado';
    next.tx.push({ id: 7, type: 'gasto', desc: 'Cine', amount: 200 });
    next.goals.push({ id: 5, name: 'Viaje', target: 1000, saved: 0, deadline: '2027-01' });
    next.cats.gasto.push('Ocio');
    next.theme = 'dark';
    const result = applyChanges(base(), diffState(base(), next));
    expect(result.tx).toEqual([...next.tx].sort((a, b) => a.id - b.id));
    expect(result.goals).toEqual(next.goals);
    expect(result.cats).toEqual(next.cats);
    expect(result.theme).toBe('dark');
  });

  it('no modifica el estado original', () => {
    const s = base();
    applyChanges(s, { tx: { upsert: [{ id: 9, amount: 1 }], delete: [1] } });
    expect(s).toEqual(base());
  });

  it('borrar algo que ya no existe no falla', () => {
    expect(applyChanges(base(), { tx: { upsert: [], delete: [999] } }).tx).toHaveLength(2);
  });
});

describe('dos dispositivos a la vez', () => {
  it('cambios en elementos distintos se conservan ambos', () => {
    const s = base();
    // Dispositivo A agrega un gasto; B edita otro y cambia el presupuesto
    const a = base();
    a.tx.push({ id: 100, type: 'gasto', desc: 'Desde la PC', amount: 30 });
    const b = base();
    b.tx[1].amount = 75;
    b.budgetPlans[0].limits.Comida = 2500;

    // El servidor recibe primero A y luego B (cada uno envía solo su diff)
    const server = applyChanges(applyChanges(s, diffState(s, a)), diffState(s, b));
    expect(server.tx.map(x => [x.id, x.amount])).toEqual([
      [1, 100],
      [2, 75],
      [100, 30],
    ]);
    expect(server.budgetPlans[0].limits.Comida).toBe(2500);
  });

  it('si los dos editan el mismo movimiento, gana el último en guardar', () => {
    const s = base();
    const a = base();
    a.tx[0].amount = 111;
    const b = base();
    b.tx[0].amount = 222;
    const server = applyChanges(applyChanges(s, diffState(s, a)), diffState(s, b));
    expect(server.tx[0].amount).toBe(222);
  });

  it('rebase: tus cambios sin enviar se reaplican sobre lo nuevo del servidor', () => {
    const synced = base(); // lo último que sincronizaste
    const server = base(); // otro dispositivo agregó un movimiento
    server.tx.push({ id: 50, type: 'gasto', desc: 'Del celular', amount: 10 });
    const local = base(); // mientras tanto tú borraste el taxi
    local.tx.splice(1, 1);
    const merged = rebase(server, synced, local);
    expect(merged.tx.map(x => x.id)).toEqual([1, 50]);
  });
});
