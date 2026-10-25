// Estado de la app, persistencia y utilidades de presentación
import { today as todayOf } from './logic/fechas.js';
import { DEFAULT_ACCOUNTS, migrate } from './logic/cuentas.js';

export const KEY = 'controlGastos.v1';
// Paleta categórica en orden fijo; se asigna por posición de la categoría, nunca por ranking
export const COLORS = ['#2a78d6','#e0702a','#1b9e77','#d6457a','#7a5bd8','#0f9bb0','#c9a000','#6a9a1f','#b5523a','#5d6d7e'];
export const DEFAULT = {
  tx: [], budgets: {}, recurring: [], goals: [], accounts: DEFAULT_ACCOUNTS, subcats: {},
  cats: {
    gasto: ['Alimentación','Transporte','Vivienda','Servicios','Salud','Entretenimiento','Educación','Ropa','Otros'],
    ingreso: ['Salario','Freelance','Inversiones','Regalos','Otros ingresos']
  },
  theme: null
};

export const today = () => todayOf();
export let state = load();
export let month = today().slice(0,7);
export function setState(s){ state = migrate(s); }
export function setMonth(m){ month = m; }

export function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.tx) return migrate({...structuredClone(DEFAULT), ...d}); } catch(e){}
  return migrate(structuredClone(DEFAULT));
}
export function save(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){ import('./ui.js').then(m => m.toast('No se pudo guardar en el navegador.', 'alert')); } }

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
