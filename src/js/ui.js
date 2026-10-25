import { KEY, state, $, esc, ic, save } from './core.js';
import { drawChart } from './resumen.js';
import { drawLine } from './analisis.js';

// ===== UI helpers =====
export function toast(msg, icon = 'check'){
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = ic(icon) + esc(msg);
  $('toasts').append(t); setTimeout(() => t.remove(), 2800);
}
// Diálogo propio en lugar de confirm()/prompt()
export function ask({title, msg = '', ok = 'Aceptar', danger = false, input = false}){
  return new Promise(res => {
    $('dlgTitle').textContent = title; $('dlgMsg').textContent = msg; $('dlgMsg').hidden = !msg;
    $('dlgOk').textContent = ok; $('dlgOk').className = 'btn' + (danger ? ' danger' : '');
    $('dlgInput').hidden = !input; $('dlgInput').required = input; $('dlgInput').value = '';
    $('dlg').hidden = false; (input ? $('dlgInput') : $('dlgOk')).focus();
    const done = v => { $('dlg').hidden = true; $('dlgForm').onsubmit = $('dlgCancel').onclick = null; res(v); };
    $('dlgForm').onsubmit = e => { e.preventDefault(); done(input ? parseFloat($('dlgInput').value) : true); };
    $('dlgCancel').onclick = () => done(input ? null : false);
  });
}
export const opts = (arr, sel) => arr.map(c => `<option${c===sel?' selected':''}>${esc(c)}</option>`).join('');
export function fillCatSelect(el, type){ const p = el.value; el.innerHTML = opts(state.cats[type]); if (state.cats[type].includes(p)) el.value = p; }
// Select de cuentas; 'first' es el texto de una opción vacía opcional
export function fillAccSelect(el, first){
  const p = el.value;
  el.innerHTML = (first ? `<option value="">${esc(first)}</option>` : '') + state.accounts.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  if ([...el.options].some(o => o.value === p)) el.value = p;
}
// Cierra un modal al hacer clic fuera o en un botón [data-close]
export function closable(modal){
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });
}

// ===== Tabs =====
export function setTab(t){
  if (!document.querySelector(`[data-panel="${t}"]`)) t = 'resumen';
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== t);
  try { localStorage.setItem(KEY + '.tab', t); } catch(e){}
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  // Las gráficas se dibujan con el ancho real, que solo existe cuando su pestaña está visible
  if (t === 'resumen') drawChart();
  if (t === 'analisis') drawLine();
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); });

// ===== Tema =====
export const isDark = () => state.theme ? state.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
export function applyTheme(){
  if (state.theme) document.documentElement.dataset.theme = state.theme; else delete document.documentElement.dataset.theme;
  $('themeIcon').setAttribute('href', isDark() ? '#i-sun' : '#i-moon');
}
$('btnTheme').onclick = () => { state.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); drawChart(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); drawChart(); });
