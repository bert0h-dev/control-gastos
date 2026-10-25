// Generación de movimientos recurrentes
import { addMonths, clampDay, daysIn } from './fechas.js';

// Devuelve los movimientos pendientes hasta 'todayStr' y actualiza lastGen de cada recurrente.
// 'newId' genera ids únicos; se inyecta para poder probarlo.
export function generatePending(recurring, todayStr, newId) {
  const curM = todayStr.slice(0, 7),
    curD = +todayStr.slice(8),
    out = [];
  recurring.forEach(r => {
    if (!r.active) return;
    let m = r.lastGen ? addMonths(r.lastGen, 1) : r.start;
    while (m <= curM) {
      // Un día 31 en un mes de 30 días vence el día 30
      if (m === curM && Math.min(r.day, daysIn(m)) > curD) break;
      out.push({
        id: newId(),
        type: r.type,
        desc: r.desc,
        amount: r.amount,
        cat: r.cat,
        method: r.method,
        account: r.account,
        date: clampDay(m, r.day),
        note: 'Recurrente',
        recId: r.id,
      });
      r.lastGen = m;
      m = addMonths(m, 1);
    }
  });
  return out;
}

// Al reanudar no se cobran los meses en pausa: se marca como generado hasta el mes anterior
export function resume(r, todayStr) {
  r.active = true;
  const prev = addMonths(todayStr.slice(0, 7), -1);
  if (!r.lastGen || r.lastGen < prev) r.lastGen = prev;
  return r;
}

export const monthlyNet = recurring =>
  recurring.filter(r => r.active).reduce((s, r) => s + Math.round((r.type === 'ingreso' ? r.amount : -r.amount) * 100), 0) / 100;
