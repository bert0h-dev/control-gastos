// Proyección de fin de mes, rangos de fechas, evolución del balance, calendario y etiquetas
import { addMonths, daysIn, clampDay } from './fechas.js';
import { round2, sum, sumOf, inMonth } from './calculos.js';

// Proyección del mes actual: gasto variable al ritmo actual + recurrentes que faltan por cobrar
export function projectMonth(tx, recurring, m, todayStr) {
  const list = inMonth(tx, m),
    exp = sumOf(list, 'gasto'),
    inc = sumOf(list, 'ingreso');
  if (todayStr.slice(0, 7) !== m) return { isCur: false, exp, inc, projExp: exp, projInc: inc, projBal: round2(inc - exp) };
  const day = +todayStr.slice(8),
    total = daysIn(m);
  const fixedExp = sum(
    list.filter(x => x.type === 'gasto' && x.recId),
    x => x.amount
  );
  const variable = round2(exp - fixedExp);
  // Recurrentes activos de este mes cuyo día aún no llega
  const pending = recurring.filter(r => r.active && r.start <= m && (!r.lastGen || r.lastGen < m) && clampDay(m, r.day) > todayStr);
  const pendExp = sum(
    pending.filter(r => r.type === 'gasto'),
    r => r.amount
  );
  const pendInc = sum(
    pending.filter(r => r.type === 'ingreso'),
    r => r.amount
  );
  const projExp = round2((variable / day) * total + fixedExp + pendExp);
  const projInc = round2(inc + pendInc);
  return { isCur: true, exp, inc, variable, fixedExp, pendExp, pendInc, projExp, projInc, projBal: round2(projInc - projExp), day, total };
}

export const inRange = (tx, from, to) => tx.filter(x => x.date >= from && x.date <= to);

// Totales de un rango de fechas con desglose por categoría, subcategoría y etiqueta
export function rangeSummary(tx, from, to) {
  const list = inRange(tx, from, to),
    exp = list.filter(x => x.type === 'gasto');
  const inc = sumOf(list, 'ingreso'),
    out = sumOf(list, 'gasto');
  const months = monthsSpan(from, to);
  const group = key => {
    const by = {};
    exp.forEach(x => {
      for (const k of [].concat(key(x) || [])) by[k] = round2((by[k] || 0) + x.amount);
    });
    return Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, pct: out ? Math.round((amount / out) * 100) : 0 }));
  };
  return {
    count: list.length,
    inc,
    exp: out,
    net: round2(inc - out),
    months,
    avgExp: round2(out / months),
    avgInc: round2(inc / months),
    byCat: group(x => x.cat),
    bySub: group(x => (x.sub ? `${x.cat} › ${x.sub}` : null)),
    byTag: group(x => x.tags),
  };
}

const monthsSpan = (from, to) => {
  const [fy, fm] = from.split('-').map(Number),
    [ty, tm] = to.split('-').map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
};

// Neto de cada mes y balance acumulado entre dos meses
export function balanceSeries(tx, fromMonth, toMonth) {
  const out = [];
  let acc = 0;
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) {
    const l = inMonth(tx, m),
      net = round2(sumOf(l, 'ingreso') - sumOf(l, 'gasto'));
    acc = round2(acc + net);
    out.push({ m, net, acc });
  }
  return out;
}

// Gasto por día del mes, para el calendario
export function dailySpend(tx, m) {
  const days = Array.from({ length: daysIn(m) }, (_, i) => ({
    day: i + 1,
    date: `${m}-${String(i + 1).padStart(2, '0')}`,
    amount: 0,
    count: 0,
  }));
  inMonth(tx, m)
    .filter(x => x.type === 'gasto')
    .forEach(x => {
      const d = days[+x.date.slice(8) - 1];
      d.amount = round2(d.amount + x.amount);
      d.count++;
    });
  return days;
}

// "#Viaje Cancún, #cumple" -> ['viaje-cancún', 'cumple']; también acepta texto separado por comas sin #
export function parseTags(text) {
  const raw = String(text || '').includes('#') ? String(text).split('#').slice(1) : String(text || '').split(',');
  return [
    ...new Set(
      raw
        .map(t =>
          t
            .split(',')[0]
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\p{L}\p{N}_-]/gu, '')
        )
        .filter(Boolean)
    ),
  ].slice(0, 10);
}

// Presets de rango a partir de un mes de referencia
export function presetRange(preset, m) {
  const end = clampDay(m, 31);
  if (preset === 'year') return { from: `${m.slice(0, 4)}-01-01`, to: end };
  const n = { '3m': 3, '6m': 6, '12m': 12 }[preset] || 1;
  return { from: `${addMonths(m, 1 - n)}-01`, to: end };
}
