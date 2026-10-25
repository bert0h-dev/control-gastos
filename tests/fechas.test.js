import { describe, it, expect } from 'vitest';
import { addMonths, daysIn, monthsUntil, clampDay, lastMonths, today } from '../src/js/logic/fechas.js';

describe('fechas', () => {
  it('suma y resta meses cruzando de año', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-05', 14)).toBe('2027-07');
  });

  it('sabe cuántos días tiene cada mes, incluido febrero bisiesto', () => {
    expect(daysIn('2026-02')).toBe(28);
    expect(daysIn('2028-02')).toBe(29);
    expect(daysIn('2026-04')).toBe(30);
    expect(daysIn('2026-12')).toBe(31);
  });

  it('ajusta el día 31 al último día del mes', () => {
    expect(clampDay('2026-02', 31)).toBe('2026-02-28');
    expect(clampDay('2026-04', 31)).toBe('2026-04-30');
    expect(clampDay('2026-03', 5)).toBe('2026-03-05');
  });

  it('cuenta meses hasta una fecha, incluyendo ambos extremos', () => {
    expect(monthsUntil('2026-10', '2026-10')).toBe(1);
    expect(monthsUntil('2026-10', '2027-02')).toBe(5);
    expect(monthsUntil('2026-10', '2026-09')).toBe(0);
  });

  it('devuelve los últimos N meses en orden', () => {
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('usa la fecha local, no UTC', () => {
    // 23:30 del 31 de octubre en hora local sigue siendo 31, aunque en UTC ya sea 1 de noviembre
    expect(today(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-31');
  });
});
