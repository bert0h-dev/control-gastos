import '../css/styles.css';
import { KEY, $, today, init } from './core.js';
import { toast, setTab, applyTheme } from './ui.js';
import { render } from './render.js';
import { drawChart } from './resumen.js';
import { drawLine } from './analisis.js';
import { runRecurring } from './recurrentes.js';
import { renderSync } from './datos.js';

// ===== Inicio =====
async function start(){
  $('rStart').value = today().slice(0,7);
  const loaded = await init();          // trae los datos del servidor SQLite
  applyTheme();
  const pending = runRecurring();
  render();
  let startTab = location.hash.slice(1);
  if (!startTab) try { startTab = localStorage.getItem(KEY + '.tab'); } catch(e){}
  setTab(startTab || 'resumen');
  document.addEventListener('sync', renderSync);
  renderSync();

  const msgs = {
    imported: ['Tus datos del navegador se copiaron a la base de datos', 'check'],
    resynced: ['Se enviaron al servidor los cambios que estaban pendientes', 'check'],
    offline: ['Sin conexión con el servidor. Trabajando con la copia local', 'alert'],
  };
  if (msgs[loaded]) toast(...msgs[loaded]);
  if (pending) setTimeout(() => toast(`Se registraron ${pending} movimiento(s) recurrente(s) pendiente(s)`, 'repeat'), 300);
}

window.addEventListener('resize', drawChart);
window.addEventListener('resize', () => drawLine());
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
start();
