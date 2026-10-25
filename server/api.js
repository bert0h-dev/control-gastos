// API HTTP: un middleware (req, res, next) que usan el servidor de Vite en desarrollo y server/index.js en producción
import { resolve } from 'node:path';
import { openDb, isEmpty, readState, writeState, lastSaved } from './db.js';
import { sanitizeBackup } from '../src/js/logic/datos.js';
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

// La base se abre en la primera petición, no al importar el módulo (Vitest también carga la config de Vite)
export function apiMiddleware(path = DB_PATH) {
  let db;
  const getDb = () => (db ||= openDb(path));
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/')) return next();
    try {
      if (url === '/api/state' && req.method === 'GET') {
        const d = getDb(),
          empty = isEmpty(d);
        return send(res, 200, { empty, state: empty ? null : readState(d), saved: lastSaved(d) });
      }
      // PUT guarda; POST existe para navigator.sendBeacon al cerrar la página
      if (url === '/api/state' && (req.method === 'PUT' || req.method === 'POST')) {
        const state = migrate(sanitizeBackup(JSON.parse(await readBody(req)), DEFAULT));
        [state.tx, state.recurring, state.goals].forEach(ensureUniqueIds);
        writeState(getDb(), state);
        return send(res, 200, { ok: true, saved: lastSaved(getDb()), count: state.tx.length });
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
