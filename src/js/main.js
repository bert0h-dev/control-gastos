import '../css/styles.css';
import { KEY, $, today } from './core.js';
import { toast, setTab, applyTheme } from './ui.js';
import { render } from './render.js';
import { drawChart } from './resumen.js';
import { drawLine } from './analisis.js';
import { runRecurring } from './recurrentes.js';

// ===== Inicio =====

$('rStart').value = today().slice(0,7);
applyTheme();
const pending = runRecurring();
render();
let startTab = location.hash.slice(1);
if (!startTab) try { startTab = localStorage.getItem(KEY + '.tab'); } catch(e){}
setTab(startTab || 'resumen');
window.addEventListener('resize', drawChart);
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
if (pending) setTimeout(() => toast(`Se registraron ${pending} movimiento(s) recurrente(s) pendiente(s)`, 'repeat'), 300);
window.addEventListener('resize', () => drawLine());
