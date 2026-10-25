// Exportar e importar: CSV y validación de respaldos JSON
import { round2 } from './calculos.js';
import { KINDS } from './cuentas.js';
import { PALETTES } from './temas.js';

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

// Limpia un respaldo JSON: descarta lo que no tenga la forma esperada en lugar de confiar en el archivo
export function sanitizeBackup(d, defaults) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.tx)) throw new Error('El archivo no es un respaldo válido');
  const num = v => (typeof v === 'number' && isFinite(v) && v >= 0 ? round2(v) : null);
  const strList = (v, fb) => (Array.isArray(v) ? [...new Set(v.map(x => str(x, 30)).filter(Boolean))] : fb);
  const out = structuredClone(defaults);

  if (Array.isArray(d.accounts))
    out.accounts = d.accounts
      .filter(a => a && str(a.id, 40) && str(a.name, 40) && KINDS[a.kind])
      .map(a => ({
        id: str(a.id, 40),
        name: str(a.name, 40),
        kind: a.kind,
        initial: typeof a.initial === 'number' && isFinite(a.initial) ? round2(a.initial) : 0,
        ...(a.kind === 'credito'
          ? {
              limit: num(a.limit) ?? 0,
              cutDay: Math.min(31, Math.max(1, a.cutDay | 0 || 1)),
              payDay: Math.min(31, Math.max(1, a.payDay | 0 || 1)),
            }
          : {}),
      }));
  const accIds = new Set((out.accounts || []).map(a => a.id));

  out.tx = d.tx
    .filter(x => x && DATE.test(x.date) && num(x.amount) > 0)
    .map((x, i) => {
      const type = TYPES.includes(x.type) ? x.type : 'gasto';
      const t = {
        id: Number.isFinite(x.id) ? x.id : Date.now() + i,
        date: x.date,
        type,
        desc: str(x.desc, 80) || 'Sin descripción',
        amount: num(x.amount),
        note: str(x.note, 140),
      };
      if (type !== 'transferencia') t.cat = str(x.cat, 30) || 'Otros';
      if (x.method) t.method = str(x.method, 30);
      if (x.recId) t.recId = x.recId;
      if (accIds.has(x.account)) t.account = x.account;
      if (type === 'transferencia') t.to = accIds.has(x.to) ? x.to : null;
      if (x.sub) t.sub = str(x.sub, 30);
      if (x.tags) t.tags = tagList(x.tags);
      return t;
    })
    .filter(x => x.type !== 'transferencia' || (x.to && x.account));

  if (d.cats && typeof d.cats === 'object') {
    out.cats.gasto = strList(d.cats.gasto, out.cats.gasto);
    out.cats.ingreso = strList(d.cats.ingreso, out.cats.ingreso);
  }
  if (d.subcats && typeof d.subcats === 'object')
    out.subcats = Object.fromEntries(Object.entries(d.subcats).map(([k, v]) => [str(k, 30), strList(v, [])]));
  if (d.budgets && typeof d.budgets === 'object')
    out.budgets = Object.fromEntries(
      Object.entries(d.budgets)
        .filter(([, v]) => num(v) > 0)
        .map(([k, v]) => [str(k, 30), num(v)])
    );
  if (Array.isArray(d.recurring))
    out.recurring = d.recurring.filter(r => r && num(r.amount) > 0 && MONTH.test(r.start) && r.day >= 1 && r.day <= 31);
  if (Array.isArray(d.goals))
    out.goals = d.goals.filter(g => g && num(g.target) > 0 && MONTH.test(g.deadline)).map(g => ({ ...g, saved: num(g.saved) ?? 0 }));
  if (d.theme === 'light' || d.theme === 'dark') out.theme = d.theme;
  if (PALETTES.some(p => p.id === d.palette)) out.palette = d.palette;
  return out;
}
