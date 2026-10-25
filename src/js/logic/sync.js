// Sincronización por cambios: en lugar de enviar todo el estado, se envía solo lo que cambió.
//
// - Colecciones con id (movimientos, recurrentes, metas): se envía cada elemento agregado o modificado
//   y los ids eliminados. Si dos dispositivos cambian elementos distintos, ambos cambios se conservan.
// - Bloques pequeños (cuentas, categorías, subcategorías, presupuestos, ajustes): si cambian se envían
//   completos, porque su orden importa y son pocos datos.

export const COLLECTIONS = ['tx', 'recurring', 'goals'];
export const BLOCKS = ['accounts', 'cats', 'subcats', 'budgets', 'settings'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const settingsOf = s => ({ theme: s.theme ?? null, palette: s.palette ?? null });
const block = (s, k) => (k === 'settings' ? settingsOf(s) : s[k]);

// Cambios necesarios para pasar de 'base' a 'next'
export function diffState(base, next) {
  const changes = {};
  for (const k of COLLECTIONS) {
    const before = new Map((base[k] || []).map(x => [x.id, x]));
    const after = new Map((next[k] || []).map(x => [x.id, x]));
    const upsert = [...after.values()].filter(x => !before.has(x.id) || !same(before.get(x.id), x));
    const del = [...before.keys()].filter(id => !after.has(id));
    if (upsert.length || del.length) changes[k] = { upsert, delete: del };
  }
  for (const k of BLOCKS) if (!same(block(base, k), block(next, k))) changes[k] = structuredClone(block(next, k));
  return changes;
}

export const isEmptyChanges = c => !c || Object.keys(c).length === 0;

// Aplica cambios sobre un estado y devuelve uno nuevo (no modifica el original)
export function applyChanges(state, changes) {
  const out = structuredClone(state);
  for (const k of COLLECTIONS) {
    const c = changes[k];
    if (!c) continue;
    const gone = new Set(c.delete || []);
    const map = new Map(out[k].filter(x => !gone.has(x.id)).map(x => [x.id, x]));
    for (const x of c.upsert || []) map.set(x.id, structuredClone(x));
    out[k] = [...map.values()].sort((a, b) => a.id - b.id);
  }
  for (const k of BLOCKS) {
    if (!(k in changes)) continue;
    if (k === 'settings') Object.assign(out, settingsOf(changes.settings));
    else out[k] = structuredClone(changes[k]);
  }
  return out;
}

// Junta cambios locales sin enviar con un estado más nuevo del servidor:
// se toma lo del servidor y encima se reaplica lo que hiciste desde la última sincronización.
export const rebase = (serverState, base, local) => applyChanges(serverState, diffState(base, local));

// Resumen legible para avisos y depuración: { tx: 3, accounts: 1, ... }
export const countChanges = c =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [k, COLLECTIONS.includes(k) ? v.upsert.length + v.delete.length : 1]));
