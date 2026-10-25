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
const TABLES = ['accounts', 'categories', 'subcategories', 'transactions', 'transaction_tags', 'recurring', 'budgets', 'goals', 'settings'];

const toCents = n => Math.round((n || 0) * 100);
const fromCents = c => c / 100;

// readOnly abre una base (p. ej. un respaldo) sin modificarla: no crea tablas ni cambia el modo del diario
export function openDb(path, { readOnly = false } = {}) {
  if (readOnly) return new DatabaseSync(path, { readOnly: true });
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;'); // escrituras seguras ante cortes
  db.exec(SCHEMA);
  return db;
}

// Copia consistente de la base completa en 'file' (funciona aunque haya escrituras en curso)
export function copyDbTo(db, file) {
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}

// La base está vacía si nunca se guardó nada (la marca 'saved' se escribe en cada guardado)
export const isEmpty = db => !db.prepare("SELECT 1 FROM settings WHERE key = 'saved'").get();

export function readState(db) {
  const all = sql => db.prepare(sql).all();
  const tags = {};
  for (const t of all('SELECT tx_id, tag FROM transaction_tags ORDER BY tx_id, position')) (tags[t.tx_id] ||= []).push(t.tag);
  const settings = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  const subcats = {};
  for (const s of all('SELECT category, name FROM subcategories ORDER BY category, position')) (subcats[s.category] ||= []).push(s.name);

  return {
    accounts: all('SELECT * FROM accounts ORDER BY position').map(a => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      initial: fromCents(a.initial_cents),
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
      id: r.id,
      type: r.type,
      desc: r.description,
      amount: fromCents(r.amount_cents),
      cat: r.category,
      account: r.account_id,
      method: r.method || '',
      day: r.day,
      start: r.start,
      lastGen: r.last_gen,
      active: !!r.active,
    })),
    budgets: Object.fromEntries(
      all('SELECT category, limit_cents FROM budgets ORDER BY position').map(b => [b.category, fromCents(b.limit_cents)])
    ),
    goals: all('SELECT * FROM goals ORDER BY id').map(g => ({
      id: g.id,
      name: g.name,
      target: fromCents(g.target_cents),
      saved: fromCents(g.saved_cents),
      deadline: g.deadline,
    })),
    theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : null,
    palette: settings.palette || 'esmeralda',
  };
}

// Escritores por entidad. INSERT OR REPLACE sirve tanto para altas como para ediciones
function writers(db) {
  const q = sql => db.prepare(sql);
  const s = {
    tx: q('INSERT OR REPLACE INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
    delTags: q('DELETE FROM transaction_tags WHERE tx_id = ?'),
    tag: q('INSERT OR IGNORE INTO transaction_tags VALUES (?,?,?)'),
    delTx: q('DELETE FROM transactions WHERE id = ?'),
    rec: q('INSERT OR REPLACE INTO recurring VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    delRec: q('DELETE FROM recurring WHERE id = ?'),
    goal: q('INSERT OR REPLACE INTO goals VALUES (?,?,?,?,?)'),
    delGoal: q('DELETE FROM goals WHERE id = ?'),
    acc: q('INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)'),
    cat: q('INSERT OR IGNORE INTO categories VALUES (?,?,?)'),
    sub: q('INSERT OR IGNORE INTO subcategories VALUES (?,?,?)'),
    bud: q('INSERT INTO budgets VALUES (?,?,?)'),
    set: q('INSERT OR REPLACE INTO settings VALUES (?,?)'),
  };
  return {
    tx(x) {
      s.tx.run(
        x.id,
        x.type,
        x.date,
        x.desc,
        toCents(x.amount),
        x.account ?? null,
        x.to ?? null,
        x.cat ?? null,
        x.sub ?? null,
        x.note ?? '',
        x.method ?? null,
        x.recId ?? null
      );
      s.delTags.run(x.id);
      (x.tags || []).forEach((t, i) => s.tag.run(x.id, t, i));
    },
    delTx(id) {
      s.delTags.run(id);
      s.delTx.run(id);
    },
    recurring: r =>
      s.rec.run(
        r.id,
        r.type,
        r.desc,
        toCents(r.amount),
        r.cat ?? null,
        r.account ?? null,
        r.method || null,
        r.day,
        r.start,
        r.lastGen ?? null,
        r.active ? 1 : 0
      ),
    delRecurring: id => s.delRec.run(id),
    goals: g => s.goal.run(g.id, g.name, toCents(g.target), toCents(g.saved), g.deadline),
    delGoals: id => s.delGoal.run(id),
    // Los bloques se reemplazan completos
    accounts(list) {
      db.exec('DELETE FROM accounts');
      list.forEach((a, i) =>
        s.acc.run(
          a.id,
          i,
          a.name,
          a.kind,
          toCents(a.initial),
          a.kind === 'credito' ? toCents(a.limit) : null,
          a.cutDay ?? null,
          a.payDay ?? null
        )
      );
    },
    cats(c) {
      db.exec('DELETE FROM categories');
      for (const type of ['gasto', 'ingreso']) c[type].forEach((n, i) => s.cat.run(n, type, i));
    },
    subcats(sc) {
      db.exec('DELETE FROM subcategories');
      for (const [c, list] of Object.entries(sc || {})) list.forEach((n, i) => s.sub.run(c, n, i));
    },
    budgets(b) {
      db.exec('DELETE FROM budgets');
      Object.entries(b).forEach(([c, v], i) => s.bud.run(c, i, toCents(v)));
    },
    settings(st) {
      s.set.run('theme', st.theme ?? null);
      s.set.run('palette', st.palette ?? null);
    },
    // Cada escritura sube la versión: así los demás dispositivos saben que hay algo nuevo
    bump() {
      const v = getVersion(db) + 1;
      s.set.run('version', String(v));
      s.set.run('saved', new Date().toISOString());
      return v;
    },
  };
}

function inTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const getVersion = db => Number(db.prepare("SELECT value FROM settings WHERE key = 'version'").get()?.value ?? 0);
export const lastSaved = db => db.prepare("SELECT value FROM settings WHERE key = 'saved'").get()?.value ?? null;

// Reemplaza todo el contenido (importación inicial o restaurar respaldo). Devuelve la nueva versión
export function writeState(db, s) {
  return inTransaction(db, () => {
    const version = getVersion(db);
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    const w = writers(db);
    db.prepare("INSERT INTO settings VALUES ('version', ?)").run(String(version));
    w.accounts(s.accounts);
    w.cats(s.cats);
    w.subcats(s.subcats);
    w.budgets(s.budgets);
    w.settings(s);
    s.tx.forEach(w.tx);
    s.recurring.forEach(w.recurring);
    s.goals.forEach(w.goals);
    return w.bump();
  });
}

// Aplica solo lo que cambió (ver src/js/logic/sync.js). Todo o nada. Devuelve la nueva versión
export function applyDelta(db, c) {
  return inTransaction(db, () => {
    const w = writers(db);
    for (const id of c.tx?.delete || []) w.delTx(id);
    for (const x of c.tx?.upsert || []) w.tx(x);
    for (const id of c.recurring?.delete || []) w.delRecurring(id);
    for (const r of c.recurring?.upsert || []) w.recurring(r);
    for (const id of c.goals?.delete || []) w.delGoals(id);
    for (const g of c.goals?.upsert || []) w.goals(g);
    for (const k of ['accounts', 'cats', 'subcats', 'budgets', 'settings']) if (c[k]) w[k](c[k]);
    return w.bump();
  });
}
