// Fechas como texto: 'YYYY-MM' (mes) y 'YYYY-MM-DD' (día), siempre en hora local

export const ym = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
export const ymd = d => `${ym(d)}-${String(d.getDate()).padStart(2,'0')}`;
export const today = (now = new Date()) => ymd(now);

export const addMonths = (m, n) => { const [y,mo] = m.split('-').map(Number); return ym(new Date(y, mo-1+n, 1)); };
export const daysIn = m => { const [y,mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };

// Meses de 'from' a 'to', ambos incluidos (0 o negativo si 'to' ya pasó)
export const monthsUntil = (from, to) => {
  const [fy,fm] = from.split('-').map(Number), [ty,tm] = to.split('-').map(Number);
  return (ty-fy)*12 + (tm-fm) + 1;
};

// Día del mes 'm' ajustado a su último día (31 en febrero -> 28/29)
export const clampDay = (m, day) => `${m}-${String(Math.min(day, daysIn(m))).padStart(2,'0')}`;

export const lastMonths = (m, n) => Array.from({length: n}, (_, i) => addMonths(m, i - n + 1));
