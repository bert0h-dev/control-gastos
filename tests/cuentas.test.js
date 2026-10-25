import { describe, it, expect } from 'vitest';
import { migrate, balanceOf, cardStatement, netWorth, daysBetween, DEFAULT_ACCOUNTS } from '../src/js/logic/cuentas.js';

const card = { id: 'tc', name: 'Visa', kind: 'credito', initial: 0, limit: 20000, cutDay: 20, payDay: 10 };
const bank = { id: 'b', name: 'Banco', kind: 'banco', initial: 5000 };
let id = 0;
const t = (date, type, amount, account, extra = {}) => ({ id: ++id, date, type, amount, account, desc: 'x', ...extra });

describe('migración', () => {
  it('crea cuentas por defecto y asigna movimientos viejos según su método de pago', () => {
    const s = migrate({
      tx: [
        t('2026-10-01', 'gasto', 1, undefined, { method: 'Efectivo' }),
        t('2026-10-01', 'gasto', 1, undefined, { method: 'Tarjeta de crédito' }),
        t('2026-10-01', 'gasto', 1, undefined, { method: 'Transferencia' }),
      ],
      recurring: [],
    });
    expect(s.accounts.map(a => a.id)).toEqual(DEFAULT_ACCOUNTS.map(a => a.id));
    expect(s.tx.map(x => x.account)).toEqual(['efectivo', 'tarjeta', 'banco']);
    expect(s.subcats).toEqual({});
  });
  it('no toca movimientos que ya tienen una cuenta válida', () => {
    const s = migrate({ accounts: [bank], tx: [t('2026-10-01', 'gasto', 1, 'b', { method: 'Efectivo' })], recurring: [] });
    expect(s.tx[0].account).toBe('b');
  });
});

describe('migración de presupuestos', () => {
  it('convierte los límites del formato anterior aunque se mezclen con el estado por defecto', () => {
    // Así se cargan los datos guardados: { ...DEFAULT, ...guardado }, y DEFAULT trae budgetPlans: []
    const s = migrate({ budgetPlans: [], ...{ tx: [], recurring: [], budgets: { Comida: 3000 } } });
    expect(s.budgetPlans).toEqual([{ from: '0000-01', limits: { Comida: 3000 } }]);
    expect(s).not.toHaveProperty('budgets');
  });
  it('no toca planes que ya existen', () => {
    const plans = [{ from: '2026-10', limits: { Ocio: 500 } }];
    expect(migrate({ tx: [], recurring: [], budgetPlans: plans, budgets: { Comida: 1 } }).budgetPlans).toEqual(plans);
  });
});

describe('saldos', () => {
  const tx = [
    t('2026-10-01', 'ingreso', 20000, 'b'),
    t('2026-10-02', 'gasto', 3000, 'b'),
    t('2026-10-03', 'transferencia', 1500, 'b', { to: 'tc' }),
    t('2026-10-04', 'gasto', 4000, 'tc'),
  ];
  it('suma ingresos, resta gastos y mueve transferencias entre cuentas', () => {
    expect(balanceOf(bank, tx)).toBe(5000 + 20000 - 3000 - 1500);
    expect(balanceOf(card, tx)).toBe(1500 - 4000);
  });
  it('calcula el saldo a una fecha', () => {
    expect(balanceOf(bank, tx, '2026-10-01')).toBe(25000);
  });
  it('el patrimonio neto no cambia con una transferencia', () => {
    expect(netWorth([bank, card], tx)).toBe(5000 + 20000 - 3000 - 4000);
  });
});

describe('tarjeta de crédito', () => {
  const tx = [
    t('2026-09-15', 'gasto', 2000, 'tc'), // periodo anterior
    t('2026-10-05', 'gasto', 3000, 'tc'), // entra al corte del 20 de octubre
    t('2026-10-22', 'gasto', 800, 'tc'), // después del corte
  ];
  it('ubica el último corte, el siguiente y la fecha de pago', () => {
    const s = cardStatement(card, tx, '2026-10-25');
    expect(s).toMatchObject({ lastCut: '2026-10-20', nextCut: '2026-11-20', due: '2026-11-10', daysToDue: 16 });
    const before = cardStatement(card, tx, '2026-10-19');
    expect(before).toMatchObject({ lastCut: '2026-09-20', due: '2026-10-10' });
  });
  it('separa lo que debes pagar del corte de los cargos nuevos', () => {
    const s = cardStatement(card, tx, '2026-10-25');
    expect(s).toMatchObject({ statement: 5000, charges: 800, debt: 5800, available: 14200, usedPct: 29, toPay: 5000, level: 'pending' });
  });
  it('los pagos después del corte reducen lo pendiente', () => {
    const paid = [...tx, t('2026-10-26', 'transferencia', 3000, 'b', { to: 'tc' })];
    expect(cardStatement(card, paid, '2026-10-27')).toMatchObject({ payments: 3000, toPay: 2000, debt: 2800 });
    const full = [...paid, t('2026-10-28', 'transferencia', 2000, 'b', { to: 'tc' })];
    expect(cardStatement(card, full, '2026-10-28')).toMatchObject({ toPay: 0, level: 'ok' });
  });
  it('avisa cuando el pago está cerca o vencido', () => {
    expect(cardStatement(card, tx, '2026-11-06').level).toBe('soon');
    expect(cardStatement(card, tx, '2026-11-12').level).toBe('overdue');
  });
  it('un día de corte 31 funciona en meses cortos', () => {
    const c31 = { ...card, cutDay: 31, payDay: 20 };
    expect(cardStatement(c31, [], '2027-02-28')).toMatchObject({ lastCut: '2027-02-28', due: '2027-03-20', nextCut: '2027-03-31' });
  });
  it('cuenta días entre fechas', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
});
