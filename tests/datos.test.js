import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, splitCsvLine, sanitizeBackup } from '../src/js/logic/datos.js';

const DEFAULT = { tx: [], budgets: {}, recurring: [], goals: [], cats: { gasto: ['Otros'], ingreso: ['Salario'] }, theme: null };
const ids = () => {
  let n = 0;
  return () => ++n;
};

describe('CSV', () => {
  it('divide líneas respetando comillas y comas internas', () => {
    expect(splitCsvLine('"2026-10-01","gasto","Cena, con ""amigos""",x')).toEqual(['2026-10-01', 'gasto', 'Cena, con "amigos"', 'x']);
  });

  it('exportar e importar devuelve los mismos movimientos, con cuentas, subcategoría y etiquetas', () => {
    const names = { b: 'Banco', tc: 'Visa' },
      ids_ = { Banco: 'b', Visa: 'tc' };
    const tx = [
      {
        date: '2026-10-01',
        type: 'gasto',
        desc: 'Cena, "especial"',
        cat: 'Alimentación',
        sub: 'Restaurantes',
        account: 'tc',
        amount: 450.5,
        tags: ['cumple', 'viaje'],
        note: 'cumple',
      },
      { date: '2026-10-02', type: 'transferencia', desc: 'Pago tarjeta', account: 'b', to: 'tc', amount: 450.5, note: '' },
    ];
    const back = parseCsv(
      toCsv(tx, id => names[id]),
      ids(),
      n => ids_[n]
    ).tx;
    expect(back).toEqual([
      { id: 1, ...tx[0] },
      { id: 2, ...tx[1] },
    ]);
  });

  it('sigue leyendo el CSV del formato anterior', () => {
    const old =
      '"Fecha","Tipo","Descripción","Categoría","Método","Monto","Notas"\n"2026-10-01","gasto","Taxi","Transporte","Efectivo","120",""';
    expect(parseCsv(old, ids()).tx[0]).toMatchObject({ desc: 'Taxi', cat: 'Transporte', method: 'Efectivo', amount: 120 });
  });

  it('omite filas con fecha o monto inválidos y las cuenta', () => {
    const csv =
      'h\n"2026-10-01","gasto","ok","Otros","",10,""\n"ayer","gasto","mala","Otros","",10,""\n"2026-10-02","gasto","cero","Otros","",0,""\n\n';
    const r = parseCsv(csv, ids());
    expect(r.tx.map(x => x.desc)).toEqual(['ok']);
    expect(r.skipped).toBe(2);
  });
});

describe('respaldo JSON', () => {
  it('rechaza archivos sin lista de movimientos', () => {
    expect(() => sanitizeBackup({ foo: 1 }, DEFAULT)).toThrow();
    expect(() => sanitizeBackup(null, DEFAULT)).toThrow();
  });

  it('descarta movimientos y presupuestos inválidos', () => {
    const d = sanitizeBackup(
      {
        tx: [
          { id: 1, date: '2026-10-01', type: 'gasto', desc: 'ok', cat: 'Otros', amount: 10 },
          { id: 2, date: 'hoy', type: 'gasto', amount: 10 },
          { id: 3, date: '2026-10-01', amount: -5 },
          { id: 4, date: '2026-10-01', amount: '100' },
          null,
        ],
        budgets: { Otros: 500, Malo: -1, Texto: 'x' },
        theme: 'rosa',
      },
      DEFAULT
    );
    expect(d.tx.map(x => x.id)).toEqual([1]);
    expect(d.budgets).toEqual({ Otros: 500 });
    expect(d.theme).toBeNull();
  });

  it('recorta textos demasiado largos y completa campos faltantes', () => {
    const d = sanitizeBackup({ tx: [{ date: '2026-10-01', amount: 1, desc: 'a'.repeat(500) }] }, DEFAULT);
    expect(d.tx[0].desc).toHaveLength(80);
    expect(d.tx[0]).toMatchObject({ type: 'gasto', cat: 'Otros' });
    expect(d.cats).toEqual(DEFAULT.cats);
  });

  it('no modifica los valores por defecto', () => {
    sanitizeBackup({ tx: [], cats: { gasto: ['Nueva'] } }, DEFAULT);
    expect(DEFAULT.cats.gasto).toEqual(['Otros']);
  });
});
