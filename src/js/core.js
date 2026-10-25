// Estado de la app, persistencia (servidor SQLite + copia local) y utilidades de presentación
import { today as todayOf } from './logic/fechas.js';
import { migrate } from './logic/cuentas.js';
import { DEFAULT } from './logic/estado.js';

export { DEFAULT };
export const KEY = 'controlGastos.v1';            // copia local del estado en localStorage
const PENDING = KEY + '.pendiente';               // '1' si hay cambios que el servidor aún no recibió
// Paleta categórica en orden fijo; se asigna por posición de la categoría, nunca por ranking
export const COLORS = ['#2a78d6','#e0702a','#1b9e77','#d6457a','#7a5bd8','#0f9bb0','#c9a000','#6a9a1f','#b5523a','#5d6d7e'];

export const today = () => todayOf();
export let state = migrate(structuredClone(DEFAULT));
export let month = today().slice(0,7);
export function setState(s){ state = migrate(s); }
export function setMonth(m){ month = m; }

// ===== Persistencia =====
// El servidor (SQLite) es la fuente de verdad. localStorage guarda una copia para no perder cambios
// si el servidor no responde; esos cambios se reenvían en cuanto vuelve.
export const sync = { online: false, saved: null, error: null };
const notify = () => document.dispatchEvent(new CustomEvent('sync'));
const local = {
  read(){ try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.tx ? d : null; } catch { return null; } },
  write(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} },
  pending(v){ try { if (v === undefined) return localStorage.getItem(PENDING) === '1'; localStorage.setItem(PENDING, v ? '1' : '0'); } catch {} },
};

async function api(method, body){
  const r = await fetch('/api/state', { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El servidor respondió ${r.status}`);
  return data;
}

// Carga inicial. Devuelve 'imported' si subió al servidor los datos que había en el navegador
export async function init(){
  const cached = local.read();
  try {
    const r = await api('GET');
    let result = 'loaded';
    // Servidor vacío con datos en el navegador (primera vez), o cambios locales sin enviar: se suben
    if (cached && (r.empty || local.pending())) {
      state = migrate({ ...structuredClone(DEFAULT), ...cached });
      await push();
      result = r.empty ? 'imported' : 'resynced';
    } else {
      state = migrate(r.empty ? structuredClone(DEFAULT) : r.state);
      Object.assign(sync, { online: true, saved: r.saved, error: null });
    }
    local.write();
    notify();
    return result;
  } catch (e) {
    // Sin servidor: se trabaja con la copia local y se reintenta
    state = migrate(cached ? { ...structuredClone(DEFAULT), ...cached } : structuredClone(DEFAULT));
    Object.assign(sync, { online: false, error: e.message });
    retryLater(); notify();
    return 'offline';
  }
}

let timer, retry, warned = false;
async function push(){
  clearTimeout(timer);
  try {
    const r = await api('PUT', state);
    local.pending(false); warned = false;
    Object.assign(sync, { online: true, saved: r.saved, error: null });
  } catch (e) {
    Object.assign(sync, { online: false, error: e.message });
    if (!warned) { warned = true; import('./ui.js').then(m => m.toast('No se pudo guardar en el servidor. Tus cambios quedan en este navegador y se enviarán al reconectar.', 'alert')); }
    retryLater();
  }
  notify();
}
function retryLater(){ clearTimeout(retry); retry = setTimeout(() => local.pending() && push(), 10000); }

// Guarda al instante en el navegador y envía al servidor agrupando cambios seguidos
export function save(){
  local.write(); local.pending(true);
  clearTimeout(timer); timer = setTimeout(push, 300);
}
// Al cerrar la pestaña, envía lo pendiente
addEventListener('pagehide', () => {
  if (local.pending()) navigator.sendBeacon?.('/api/state', new Blob([JSON.stringify(state)], { type: 'application/json' }));
});

// Ids únicos aunque se creen varios en el mismo milisegundo
let lastId = 0;
export const newId = () => (lastId = Math.max(Date.now(), lastId + 1));

export const $ = id => document.getElementById(id);
export const fmt = n => n.toLocaleString('es-MX', {style:'currency', currency:'MXN'});
export const fmt0 = n => n.toLocaleString('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:0});
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ic = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
export const monthName = (m, opt = {month:'long', year:'numeric'}) => { const [y,mo] = m.split('-'); return new Date(y, mo-1).toLocaleDateString('es-MX', opt); };
export const allCats = () => [...state.cats.gasto, ...state.cats.ingreso];
export const account = id => state.accounts.find(a => a.id === id);
export const accName = id => account(id)?.name ?? 'Sin cuenta';
export const catColor = c => { const i = allCats().indexOf(c); return i < 0 ? '#8a958e' : COLORS[i % COLORS.length]; };
