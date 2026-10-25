// Exportar e importar: CSV y validación de respaldos JSON
import { round2 } from './calculos.js';
import { KINDS } from './cuentas.js';
import { PALETTES } from './temas.js';
import { fromLegacy } from './presupuestos.js';

export const CSV_HEADER = [
  'Fecha',
  'Tipo',
  'Descripción',
  'Categoría',
  'Subcategoría',
  'Cuenta',
  'Cuenta destino',
  'Monto',
  'Etiquetas',
  'Notas',
];
const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

// 'accountName' traduce el id de cuenta a su nombre para que el CSV sea legible
export const toCsv = (tx, accountName = id => id ?? '') =>
  '\uFEFF' +
  [
    CSV_HEADER,
    ...tx.map(x => [
      x.date,
      x.type,
      x.desc,
      x.cat,
      x.sub,
      accountName(x.account),
      x.type === 'transferencia' ? accountName(x.to) : '',
      x.amount,
      (x.tags || []).join(' '),
      x.note,
    ]),
  ]
    .map(r => r.map(cell).join(','))
    .join('\n');

// Divide una línea CSV respetando comillas y comillas escapadas ("")
export function splitCsvLine(line) {
  const out = [];
  let cur = '',
    q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/,
  MONTH = /^\d{4}-\d{2}$/;
const TYPES = ['gasto', 'ingreso', 'transferencia'];
const str = (v, max) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const tagList = v => (Array.isArray(v) ? [...new Set(v.map(t => str(t, 30).toLowerCase()).filter(Boolean))].slice(0, 10) : []);

// Convierte texto CSV en movimientos válidos; las filas inválidas se cuentan y se descartan.
// Acepta el formato actual (10 columnas) y el anterior (Fecha, Tipo, Descripción, Categoría, Método, Monto, Notas).
// 'accountId' traduce un nombre de cuenta a su id.
export function parseCsv(text, newId, accountId = () => undefined) {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(l => l.trim());
  const legacy = rows.length && splitCsvLine(rows[0]).length <= 7;
  const tx = [];
  let skipped = 0;
  for (const l of rows.slice(1)) {
    const c = splitCsvLine(l);
    const r = legacy
      ? { date: c[0], type: c[1], desc: c[2], cat: c[3], method: c[4], amount: c[5], note: c[6] }
      : { date: c[0], type: c[1], desc: c[2], cat: c[3], sub: c[4], account: c[5], to: c[6], amount: c[7], tags: c[8], note: c[9] };
    const a = round2(parseFloat(r.amount));
    if (!DATE.test(r.date) || !(a > 0)) {
      skipped++;
      continue;
    }
    const type = TYPES.includes(r.type) ? r.type : 'gasto';
    const x = { id: newId(), date: r.date, type, desc: str(r.desc, 80) || 'Sin descripción', amount: a, note: str(r.note, 140) };
    if (type !== 'transferencia') x.cat = str(r.cat, 30) || 'Otros';
    if (r.method) x.method = str(r.method, 30);
    if (r.sub) x.sub = str(r.sub, 30);
    if (r.tags) x.tags = tagList(r.tags.split(/[\s,]+/));
    const acc = accountId(r.account);
    if (acc) x.account = acc;
    if (type === 'transferencia') {
      const to = accountId(r.to);
      if (!to || !acc) {
        skipped++;
        continue;
      }
      x.to = to;
    }
    tx.push(x);
  }
  return { tx, skipped };
}

// ===== Validación =====
// Nunca se confía en lo que llega (un respaldo, otro dispositivo): cada dato se reconstruye campo por campo
// y lo que no tiene la forma esperada se descarta. Lo usan la importación y el servidor.
const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? round2(v) : null);
const strList = (v, fb) => (Array.isArray(v) ? [...new Set(v.map(x => str(x, 30)).filter(Boolean))] : fb);
const day = v => Math.min(31, Math.max(1, v | 0 || 1));
const safeId = v => (Number.isSafeInteger(v) ? v : null);

export function sanitizeAccounts(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter(a => a && str(a.id, 40) && str(a.name, 40) && KINDS[a.kind])
    .map(a => ({
      id: str(a.id, 40),
      name: str(a.name, 40),
      kind: a.kind,
      initial: typeof a.initial === 'number' && isFinite(a.initial) ? round2(a.initial) : 0,
      ...(a.kind === 'credito' ? { limit: num(a.limit) ?? 0, cutDay: day(a.cutDay), payDay: day(a.payDay) } : {}),
    }));
}

// 'accIds' (opcional) limita las cuentas válidas; sin él se acepta cualquier id de cuenta con forma válida
export function sanitizeTx(x, accIds) {
  if (!x || !DATE.test(x.date) || !(num(x.amount) > 0)) return null;
  const okAcc = id => typeof id === 'string' && id && (!accIds || accIds.has(id));
  const type = TYPES.includes(x.type) ? x.type : 'gasto';
  const t = {
    id: safeId(x.id),
    date: x.date,
    type,
    desc: str(x.desc, 80) || 'Sin descripción',
    amount: num(x.amount),
    note: str(x.note, 140),
  };
  if (type !== 'transferencia') t.cat = str(x.cat, 30) || 'Otros';
  if (x.method) t.method = str(x.method, 30);
  if (safeId(x.recId)) t.recId = x.recId;
  if (okAcc(x.account)) t.account = str(x.account, 40);
  if (type === 'transferencia') {
    if (!okAcc(x.to) || !t.account || x.to === t.account) return null;
    t.to = str(x.to, 40);
  }
  if (x.sub) t.sub = str(x.sub, 30);
  if (x.tags) t.tags = tagList(x.tags);
  return t;
}

export function sanitizeRecurring(r) {
  if (!r || !(num(r.amount) > 0) || !MONTH.test(r.start) || !(r.day >= 1 && r.day <= 31) || !safeId(r.id)) return null;
  return {
    id: r.id,
    type: r.type === 'ingreso' ? 'ingreso' : 'gasto',
    desc: str(r.desc, 80) || 'Sin descripción',
    amount: num(r.amount),
    cat: str(r.cat, 30) || 'Otros',
    account: typeof r.account === 'string' ? str(r.account, 40) : undefined,
    method: str(r.method, 30),
    day: r.day | 0,
    start: r.start,
    lastGen: MONTH.test(r.lastGen) ? r.lastGen : null,
    active: r.active !== false,
  };
}

export function sanitizeGoal(g) {
  if (!g || !(num(g.target) > 0) || !MONTH.test(g.deadline) || !safeId(g.id)) return null;
  return { id: g.id, name: str(g.name, 40) || 'Meta', target: num(g.target), saved: num(g.saved) ?? 0, deadline: g.deadline };
}

export function sanitizeCats(c, fb) {
  if (!c || typeof c !== 'object') return null;
  return { gasto: strList(c.gasto, fb.gasto), ingreso: strList(c.ingreso, fb.ingreso) };
}
export const sanitizeSubcats = s =>
  s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).map(([k, v]) => [str(k, 30), strList(v, [])])) : null;
export const sanitizeBudgets = b =>
  b && typeof b === 'object'
    ? Object.fromEntries(
        Object.entries(b)
          .filter(([, v]) => num(v) > 0)
          .map(([k, v]) => [str(k, 30), num(v)])
      )
    : null;
// Planes de presupuesto: { from: 'YYYY-MM', limits: { categoría: monto } }
export const sanitizeBudgetPlans = plans =>
  Array.isArray(plans)
    ? plans
        .filter(p => p && MONTH.test(p.from))
        .map(p => ({ from: p.from, limits: sanitizeBudgets(p.limits) || {} }))
        .filter((p, i, all) => all.findIndex(q => q.from === p.from) === i)
    : null;

export function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : null,
    palette: PALETTES.some(p => p.id === s.palette) ? s.palette : PALETTES[0].id,
  };
}

// Limpia un respaldo JSON completo
export function sanitizeBackup(d, defaults) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.tx)) throw new Error('El archivo no es un respaldo válido');
  const out = structuredClone(defaults);
  out.accounts = sanitizeAccounts(d.accounts) ?? out.accounts;
  const accIds = Array.isArray(d.accounts) ? new Set(out.accounts.map(a => a.id)) : null;
  out.tx = d.tx
    .map(x => sanitizeTx(x, accIds))
    .filter(Boolean)
    .map((x, i) => (x.id === null ? { ...x, id: Date.now() + i } : x));
  out.cats = sanitizeCats(d.cats, out.cats) ?? out.cats;
  out.subcats = sanitizeSubcats(d.subcats) ?? out.subcats;
  // Respaldos anteriores traen 'budgets' (sin historial); se convierten a planes
  out.budgetPlans = sanitizeBudgetPlans(d.budgetPlans) ?? fromLegacy(sanitizeBudgets(d.budgets));
  if (Array.isArray(d.recurring)) out.recurring = d.recurring.map(sanitizeRecurring).filter(Boolean);
  if (Array.isArray(d.goals)) out.goals = d.goals.map(sanitizeGoal).filter(Boolean);
  Object.assign(out, sanitizeSettings({ theme: d.theme, palette: d.palette ?? defaults.palette }));
  return out;
}
