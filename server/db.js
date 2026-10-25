// Acceso a SQLite. Es el único archivo que conoce la base: cambiar de driver (p. ej. a better-sqlite3) solo toca aquí
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// node:sqlite se carga con require para que Vite y Vitest no intenten resolverlo como módulo del navegador
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('efectivo','banco','ahorro','credito')),
  initial_cents INTEGER NOT NULL DEFAULT 0, limit_cents INTEGER, cut_day INTEGER, pay_day INTEGER
);
CREATE TABLE IF NOT EXISTS categories (
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('gasto','ingreso')), position INTEGER NOT NULL,
  PRIMARY KEY (name, type)
);
CREATE TABLE IF NOT EXISTS subcategories (category TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (category, name));
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('gasto','ingreso','transferencia')),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  account_id TEXT, to_account_id TEXT,
  category TEXT, subcategory TEXT, note TEXT NOT NULL DEFAULT '', method TEXT,
  recurring_id INTEGER
);
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(date);
CREATE TABLE IF NOT EXISTS transaction_tags (tx_id INTEGER NOT NULL, tag TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (tx_id, tag));
CREATE TABLE IF NOT EXISTS recurring (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  category TEXT, account_id TEXT, method TEXT, day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  start TEXT NOT NULL, last_gen TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS budgets (category TEXT PRIMARY KEY, position INTEGER NOT NULL, limit_cents INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, name TEXT NOT NULL, target_cents INTEGER NOT NULL, saved_cents INTEGER NOT NULL DEFAULT 0, deadline TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;
const TABLES = ['accounts','categories','subcategories','transactions','transaction_tags','recurring','budgets','goals','settings'];

const toCents = n => Math.round((n || 0) * 100);
const fromCents = c => c / 100;

export function openDb(path){
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;'); // escrituras seguras ante cortes
  db.exec(SCHEMA);
  return db;
}

// La base está vacía si nunca se guardó nada (la marca 'saved' se escribe en cada guardado)
export const isEmpty = db => !db.prepare("SELECT 1 FROM settings WHERE key = 'saved'").get();

export function readState(db){
  const all = sql => db.prepare(sql).all();
  const tags = {};
  for (const t of all('SELECT tx_id, tag FROM transaction_tags ORDER BY tx_id, position')) (tags[t.tx_id] ||= []).push(t.tag);
  const settings = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  const subcats = {};
  for (const s of all('SELECT category, name FROM subcategories ORDER BY category, position')) (subcats[s.category] ||= []).push(s.name);

  return {
    accounts: all('SELECT * FROM accounts ORDER BY position').map(a => ({
      id: a.id, name: a.name, kind: a.kind, initial: fromCents(a.initial_cents),
      ...(a.kind === 'credito' ? { limit: fromCents(a.limit_cents ?? 0), cutDay: a.cut_day, payDay: a.pay_day } : {}),
    })),
    cats: {
      gasto: all("SELECT name FROM categories WHERE type = 'gasto' ORDER BY position").map(r => r.name),
      ingreso: all("SELECT name FROM categories WHERE type = 'ingreso' ORDER BY position").map(r => r.name),
    },
    subcats,
    tx: all('SELECT * FROM transactions ORDER BY id').map(r => {
      const x = { id: r.id, type: r.type, date: r.date, desc: r.description, amount: fromCents(r.amount_cents), note: r.note };
      if (r.account_id) x.account = r.account_id;
      if (r.to_account_id) x.to = r.to_account_id;
      if (r.category) x.cat = r.category;
      if (r.subcategory) x.sub = r.subcategory;
      if (r.method) x.method = r.method;
      if (r.recurring_id) x.recId = r.recurring_id;
      if (tags[r.id]) x.tags = tags[r.id];
      return x;
    }),
    recurring: all('SELECT * FROM recurring ORDER BY id').map(r => ({
      id: r.id, type: r.type, desc: r.description, amount: fromCents(r.amount_cents), cat: r.category, account: r.account_id,
      method: r.method || '', day: r.day, start: r.start, lastGen: r.last_gen, active: !!r.active,
    })),
    budgets: Object.fromEntries(all('SELECT category, limit_cents FROM budgets ORDER BY position').map(b => [b.category, fromCents(b.limit_cents)])),
    goals: all('SELECT * FROM goals ORDER BY id').map(g => ({ id: g.id, name: g.name, target: fromCents(g.target_cents), saved: fromCents(g.saved_cents), deadline: g.deadline })),
    theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : null,
    palette: settings.palette || 'esmeralda',
  };
}

// Reemplaza todo el contenido dentro de una transacción: o se guarda completo o no se guarda nada
export function writeState(db, s){
  db.exec('BEGIN');
  try {
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    const ins = (sql) => db.prepare(sql);
    const acc = ins('INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)');
    s.accounts.forEach((a, i) => acc.run(a.id, i, a.name, a.kind, toCents(a.initial),
      a.kind === 'credito' ? toCents(a.limit) : null, a.cutDay ?? null, a.payDay ?? null));
    const cat = ins('INSERT OR IGNORE INTO categories VALUES (?,?,?)');
    for (const type of ['gasto', 'ingreso']) s.cats[type].forEach((n, i) => cat.run(n, type, i));
    const sub = ins('INSERT OR IGNORE INTO subcategories VALUES (?,?,?)');
    for (const [c, list] of Object.entries(s.subcats || {})) list.forEach((n, i) => sub.run(c, n, i));
    const tx = ins('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    const tag = ins('INSERT OR IGNORE INTO transaction_tags VALUES (?,?,?)');
    for (const x of s.tx) {
      tx.run(x.id, x.type, x.date, x.desc, toCents(x.amount), x.account ?? null, x.to ?? null,
        x.cat ?? null, x.sub ?? null, x.note ?? '', x.method ?? null, x.recId ?? null);
      (x.tags || []).forEach((t, i) => tag.run(x.id, t, i));
    }
    const rec = ins('INSERT INTO recurring VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (const r of s.recurring) rec.run(r.id, r.type, r.desc, toCents(r.amount), r.cat ?? null, r.account ?? null,
      r.method || null, r.day, r.start, r.lastGen ?? null, r.active ? 1 : 0);
    const bud = ins('INSERT INTO budgets VALUES (?,?,?)');
    Object.entries(s.budgets).forEach(([c, v], i) => bud.run(c, i, toCents(v)));
    const goal = ins('INSERT INTO goals VALUES (?,?,?,?,?)');
    for (const g of s.goals) goal.run(g.id, g.name, toCents(g.target), toCents(g.saved), g.deadline);
    const set = ins('INSERT INTO settings VALUES (?,?)');
    set.run('theme', s.theme ?? null);
    set.run('palette', s.palette ?? null);
    set.run('saved', new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const lastSaved = db => db.prepare("SELECT value FROM settings WHERE key = 'saved'").get()?.value ?? null;
