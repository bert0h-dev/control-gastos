// Estado de la app, persistencia (servidor SQLite + copia local) y utilidades de presentación
import { today as todayOf } from './logic/fechas.js';
import { migrate } from './logic/cuentas.js';
import { DEFAULT } from './logic/estado.js';
import { diffState, isEmptyChanges, rebase } from './logic/sync.js';

export { DEFAULT };
export const KEY = 'controlGastos.v1'; // copia local del estado en localStorage
const BASE = KEY + '.sincronizado'; // último estado confirmado con el servidor y su versión
const LEGACY_PENDING = KEY + '.pendiente'; // marca de la versión anterior (fase 1)
// Paleta categórica en orden fijo; se asigna por posición de la categoría, nunca por ranking
export const COLORS = ['#2a78d6', '#e0702a', '#1b9e77', '#d6457a', '#7a5bd8', '#0f9bb0', '#c9a000', '#6a9a1f', '#b5523a', '#5d6d7e'];

export const today = () => todayOf();
export let state = migrate(structuredClone(DEFAULT));
export let month = today().slice(0, 7);
export function setState(s) {
  state = migrate(s);
}
export function setMonth(m) {
  month = m;
}

// ===== Persistencia =====
// El servidor (SQLite) es la fuente de verdad. Cada dispositivo guarda:
//   - 'synced': el último estado que confirmó con el servidor, y 'version': la versión de ese estado.
//   - una copia local de todo en localStorage, para no perder nada si el servidor no responde.
// Al guardar se envía solo diffState(synced, state). Si el servidor tiene una versión más nueva
// (otro dispositivo guardó), se trae y se reaplican encima los cambios locales (rebase).
export const sync = { online: false, saved: null, error: null, version: 0 };
let synced = null;
const notify = () => document.dispatchEvent(new CustomEvent('sync'));
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const localState = () => {
  const d = store.get(KEY);
  return d && d.tx ? migrate({ ...structuredClone(DEFAULT), ...d }) : null;
};
// Recuerda lo sincronizado para poder calcular cambios aunque se recargue la página sin conexión
function markSynced(s, meta) {
  synced = structuredClone(s);
  Object.assign(sync, { online: true, error: null, version: meta.version, saved: meta.saved });
  store.set(BASE, { version: meta.version, state: synced });
}

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El servidor respondió ${r.status}`);
  return data;
}

// Carga inicial. Devuelve 'loaded', 'imported', 'resynced' u 'offline'
export async function init() {
  const cached = localState(),
    base = store.get(BASE);
  try {
    const r = await api('GET', '/api/state');
    if (r.empty) {
      // Base nueva: se inicializa con lo que haya en el navegador (o el estado por defecto)
      state = cached || migrate(structuredClone(DEFAULT));
      markSynced(state, await api('PUT', '/api/state', state));
      store.set(KEY, state);
      notify();
      return cached ? 'imported' : 'loaded';
    }
    const server = migrate(r.state);
    if (cached && base?.state && !isEmptyChanges(diffState(base.state, cached))) {
      // Quedaron cambios sin enviar de la sesión anterior: se reaplican sobre lo actual del servidor
      state = rebase(server, base.state, cached);
      markSynced(server, r);
      store.set(KEY, state);
      await push();
      return 'resynced';
    }
    if (cached && !base && store.get(LEGACY_PENDING) === 1) {
      // Cambios pendientes de la versión anterior (fase 1, sin 'synced'): se envía todo
      state = cached;
      markSynced(state, await api('PUT', '/api/state', state));
      store.set(LEGACY_PENDING, 0);
      return 'resynced';
    }
    state = server;
    markSynced(server, r);
    store.set(KEY, state);
    notify();
    return 'loaded';
  } catch (e) {
    // Sin servidor: se trabaja con la copia local y se reintenta
    state = cached || migrate(structuredClone(DEFAULT));
    synced = base?.state ?? structuredClone(state);
    Object.assign(sync, { online: false, error: e.message, version: base?.version ?? 0 });
    retryLater();
    notify();
    return 'offline';
  }
}

let timer,
  retry,
  busy = false,
  again = false,
  warned = false;

// Envía los cambios pendientes. Nunca hay dos envíos a la vez; si llegan cambios durante uno, se encadena otro
async function push() {
  clearTimeout(timer);
  if (busy) return void (again = true);
  const snapshot = structuredClone(state),
    changes = diffState(synced, snapshot);
  if (isEmptyChanges(changes)) return;
  busy = true;
  try {
    const before = sync.version;
    const r = await api('PATCH', '/api/changes', { changes });
    markSynced(snapshot, r);
    warned = false;
    // Si la versión saltó más de uno, otro dispositivo guardó entre medio: hay que traer sus cambios
    if (r.version > before + 1) await pull();
  } catch (e) {
    Object.assign(sync, { online: false, error: e.message });
    if (!warned) {
      warned = true;
      import('./ui.js').then(m =>
        m.toast('No se pudo guardar en el servidor. Tus cambios quedan en este navegador y se enviarán al reconectar.', 'alert')
      );
    }
    retryLater();
  } finally {
    busy = false;
  }
  notify();
  if (again) {
    again = false;
    push();
  }
}

// Trae el estado del servidor y conserva encima lo que no se haya enviado todavía
async function pull() {
  const r = await api('GET', '/api/state');
  if (r.empty) return;
  const server = migrate(r.state),
    local = diffState(synced, state);
  const next = isEmptyChanges(local) ? server : rebase(server, synced, state);
  const changed = !isEmptyChanges(diffState(state, next));
  state = next;
  markSynced(server, r);
  store.set(KEY, state);
  if (changed) document.dispatchEvent(new CustomEvent('remotechange'));
  if (!isEmptyChanges(local)) push();
}

function retryLater() {
  clearTimeout(retry);
  retry = setTimeout(() => (isEmptyChanges(diffState(synced, state)) ? checkRemote() : push()), 10000);
}

// Pregunta solo la versión; si hay una más nueva y no hay envíos en curso, trae los cambios
async function checkRemote() {
  if (busy || document.hidden) return;
  try {
    const r = await api('GET', '/api/version');
    if (!sync.online) {
      Object.assign(sync, { online: true, error: null });
      notify();
    }
    if (r.version !== sync.version) await pull();
  } catch (e) {
    if (sync.online) {
      Object.assign(sync, { online: false, error: e.message });
      notify();
    }
  }
}
setInterval(checkRemote, 15000);
document.addEventListener('visibilitychange', () => !document.hidden && checkRemote());

// Guarda al instante en el navegador y envía al servidor agrupando cambios seguidos
export function save() {
  store.set(KEY, state);
  clearTimeout(timer);
  timer = setTimeout(push, 300);
}
// Al cerrar la pestaña, envía lo pendiente
addEventListener('pagehide', () => {
  if (!synced) return;
  const changes = diffState(synced, state);
  if (!isEmptyChanges(changes))
    navigator.sendBeacon?.('/api/changes', new Blob([JSON.stringify({ changes })], { type: 'application/json' }));
});

// Ids únicos aunque se creen varios en el mismo milisegundo o en dos dispositivos a la vez:
// milisegundos × 1000 + un número aleatorio (sigue siendo un entero seguro y crece con el tiempo)
let lastId = 0;
export const newId = () => (lastId = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastId + 1));
export const $ = id => document.getElementById(id);
export const fmt = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const fmt0 = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ic = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
export const monthName = (m, opt = { month: 'long', year: 'numeric' }) => {
  const [y, mo] = m.split('-');
  return new Date(y, mo - 1).toLocaleDateString('es-MX', opt);
};
export const allCats = () => [...state.cats.gasto, ...state.cats.ingreso];
export const account = id => state.accounts.find(a => a.id === id);
export const accName = id => account(id)?.name ?? 'Sin cuenta';
export const catColor = c => {
  const i = allCats().indexOf(c);
  return i < 0 ? '#8a958e' : COLORS[i % COLORS.length];
};
