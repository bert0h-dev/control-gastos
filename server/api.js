// API HTTP: un middleware (req, res, next) que usan el servidor de Vite en desarrollo y server/index.js en producción
//
//   GET   /api/state     estado completo + versión
//   GET   /api/version   solo la versión (los dispositivos la consultan para saber si hay cambios de otro)
//   PUT   /api/state     reemplaza todo (importación inicial, restaurar respaldo)
//   PATCH /api/changes   aplica solo lo que cambió (uso normal)
//   POST  en las dos rutas anteriores equivale a PUT / PATCH (para navigator.sendBeacon al cerrar la página)
import { resolve } from 'node:path';
import { openDb, isEmpty, readState, writeState, applyDelta, getVersion, lastSaved } from './db.js';
import {
  sanitizeBackup,
  sanitizeTx,
  sanitizeRecurring,
  sanitizeGoal,
  sanitizeAccounts,
  sanitizeCats,
  sanitizeSubcats,
  sanitizeBudgets,
  sanitizeSettings,
} from '../src/js/logic/datos.js';
import { migrate } from '../src/js/logic/cuentas.js';
import { DEFAULT } from '../src/js/logic/estado.js';

export const DB_PATH = resolve(process.env.GASTOS_DB || 'data/gastos.db');
const MAX_BODY = 20 * 1024 * 1024;

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};
const badRequest = msg => Object.assign(new Error(msg), { status: 400 });

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('Datos demasiado grandes'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

// Datos antiguos pueden traer ids repetidos; en SQLite romperían la llave primaria, así que se reasignan
export function ensureUniqueIds(list) {
  const seen = new Set();
  let next = Math.max(0, ...list.map(x => (Number.isSafeInteger(x.id) ? x.id : 0))) + 1;
  for (const x of list) {
    if (!Number.isSafeInteger(x.id) || seen.has(x.id)) x.id = next++;
    seen.add(x.id);
  }
  return list;
}

// Valida un paquete de cambios con las mismas reglas que un respaldo completo
export function sanitizeChanges(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw badRequest('Cambios inválidos');
  const out = {};
  const ids = v => (Array.isArray(v) ? v.filter(Number.isSafeInteger) : []);
  const coll = (k, fn) => {
    if (!c[k]) return;
    const upsert = (Array.isArray(c[k].upsert) ? c[k].upsert : []).map(x => fn(x)).filter(x => x && x.id !== null);
    out[k] = { upsert, delete: ids(c[k].delete) };
  };
  coll('tx', x => sanitizeTx(x));
  coll('recurring', sanitizeRecurring);
  coll('goals', sanitizeGoal);
  if (c.accounts) {
    out.accounts = sanitizeAccounts(c.accounts);
    if (!out.accounts?.length) throw badRequest('Debe quedar al menos una cuenta');
  }
  if (c.cats) out.cats = sanitizeCats(c.cats, DEFAULT.cats);
  if (c.subcats) out.subcats = sanitizeSubcats(c.subcats);
  if (c.budgets) out.budgets = sanitizeBudgets(c.budgets);
  if (c.settings) out.settings = sanitizeSettings(c.settings);
  return out;
}

// La base se abre en la primera petición, no al importar el módulo (Vitest también carga la config de Vite)
export function apiMiddleware(path = DB_PATH) {
  let db;
  const getDb = () => (db ||= openDb(path));
  const meta = d => ({ version: getVersion(d), saved: lastSaved(d) });
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/')) return next();
    const m = req.method;
    try {
      if (url === '/api/state' && m === 'GET') {
        const d = getDb(),
          empty = isEmpty(d);
        return send(res, 200, { empty, state: empty ? null : readState(d), ...meta(d) });
      }
      if (url === '/api/version' && m === 'GET') return send(res, 200, meta(getDb()));
      if (url === '/api/state' && (m === 'PUT' || m === 'POST')) {
        const state = migrate(sanitizeBackup(JSON.parse(await readBody(req)), DEFAULT));
        [state.tx, state.recurring, state.goals].forEach(ensureUniqueIds);
        writeState(getDb(), state);
        return send(res, 200, { ok: true, count: state.tx.length, ...meta(getDb()) });
      }
      if (url === '/api/changes' && (m === 'PATCH' || m === 'POST')) {
        const changes = sanitizeChanges(JSON.parse(await readBody(req)).changes);
        applyDelta(getDb(), changes);
        return send(res, 200, { ok: true, ...meta(getDb()) });
      }
      if (url === '/api/health') return send(res, 200, { ok: true, db: path });
      return send(res, 404, { error: 'Ruta no encontrada' });
    } catch (e) {
      const status = e.status || (e instanceof SyntaxError || /respaldo válido/.test(e.message) ? 400 : 500);
      if (status === 500) console.error('[api]', e);
      return send(res, status, { error: e.message });
    }
  };
}
