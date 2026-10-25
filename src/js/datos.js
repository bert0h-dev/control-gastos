import { DEFAULT, state, $, today, save, allCats, setState, newId, accName, sync, esc, ic } from './core.js';
import { toCsv, parseCsv, sanitizeBackup } from './logic/datos.js';
import { toast, ask, applyTheme, action } from './ui.js';
import { render } from './render.js';
import { filteredTx } from './movimientos.js';

// ===== Estado de la conexión con la base de datos =====
export function renderSync() {
  const t = sync.saved ? new Date(sync.saved).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  $('syncBox').className = 'sync ' + (sync.online ? 'ok' : 'off');
  $('syncTitle').textContent = sync.online ? 'Guardado en la base de datos' : 'Sin conexión con el servidor';
  $('syncDetail').textContent = sync.online
    ? t
      ? `Último guardado: ${t}`
      : 'Aún no hay cambios guardados'
    : 'Los cambios se guardan en este navegador y se enviarán al reconectar. ¿Está corriendo npm run dev o npm start?';
}

// ===== Respaldos automáticos (los crea el servidor; ver server/respaldos.js) =====
const KIND = { diario: 'Diario', manual: 'Manual', 'antes-de-restaurar': 'Antes de restaurar' };
const size = b => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export async function loadBackups() {
  try {
    const r = await fetch('/api/backups').then(res => (res.ok ? res.json() : Promise.reject()));
    const last = r.backups[0];
    $('bkHint').textContent = last
      ? `Se conservan los últimos ${r.keep}. Más reciente: ${new Date(last.created).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
      : `Aún no hay respaldos. Se crea uno automático cada día que uses la app (se conservan los últimos ${r.keep}).`;
    $('bkList').innerHTML = r.backups
      .slice(0, 8)
      .map(
        b => `<div class="bk">
        <div class="bk-info"><b>${new Date(b.created).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</b>
          <span class="hint">${KIND[b.kind] || esc(b.kind)} · ${size(b.size)}</span></div>
        <a class="iconbtn" href="/api/backups/${encodeURIComponent(b.name)}" download aria-label="Descargar respaldo">${ic('download')}</a>
        <button class="iconbtn" data-action="restoreBackup" data-name="${esc(b.name)}" data-when="${esc(new Date(b.created).toLocaleString('es-MX'))}" aria-label="Restaurar este respaldo">${ic('repeat')}</button>
      </div>`
      )
      .join('');
    if (r.backups.length > 8)
      $('bkList').insertAdjacentHTML('beforeend', `<div class="hint">y ${r.backups.length - 8} más en la carpeta de respaldos</div>`);
  } catch {
    $('bkHint').textContent = 'No se pudo consultar los respaldos: el servidor no responde.';
    $('bkList').innerHTML = '';
  }
}

$('btnBackupNow').onclick = async () => {
  const r = await fetch('/api/backups', { method: 'POST' });
  if (!r.ok) return toast('No se pudo crear el respaldo', 'alert');
  toast('Respaldo creado', 'check');
  loadBackups();
};

action('restoreBackup', async ({ name, when }) => {
  const ok = await ask({
    title: '¿Restaurar este respaldo?',
    msg: `Tus datos volverán a como estaban el ${when}. Antes se guarda un respaldo de lo actual, por si necesitas regresar.`,
    ok: 'Restaurar',
    danger: true,
  });
  if (!ok) return;
  const r = await fetch(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return toast(data.error || 'No se pudo restaurar', 'alert');
  // Se recarga para tomar los datos restaurados del servidor (los demás dispositivos los reciben solos)
  toast('Respaldo restaurado. Recargando…', 'check');
  setTimeout(() => location.reload(), 800);
});

// La lista se actualiza cada vez que se abre Ajustes
document.addEventListener('tabchange', e => e.detail === 'ajustes' && loadBackups());

// ===== Exportar / importar =====
export function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('btnExportCsv').onclick = () => download(`gastos_${today()}.csv`, toCsv(filteredTx(), accName), 'text/csv');
// Nombre de cuenta del CSV -> id (sin distinguir mayúsculas)
const accountByName = name =>
  state.accounts.find(
    a =>
      a.name.toLowerCase() ===
      String(name || '')
        .trim()
        .toLowerCase()
  )?.id;
$('btnExportJson').onclick = () => {
  download(`respaldo_gastos_${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
  toast('Respaldo descargado', 'download');
};
$('btnImport').onclick = () => $('fileImport').click();
$('fileImport').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  const text = await f.text();
  e.target.value = '';
  try {
    if (f.name.toLowerCase().endsWith('.json')) {
      const d = sanitizeBackup(JSON.parse(text), DEFAULT);
      if (
        !(await ask({
          title: '¿Reemplazar tus datos?',
          msg: `El respaldo trae ${d.tx.length} movimientos y sustituirá todo lo actual.`,
          ok: 'Reemplazar',
          danger: true,
        }))
      )
        return;
      setState(d);
      toast('Respaldo restaurado');
    } else {
      const { tx, skipped } = parseCsv(text, newId, accountByName);
      tx.forEach(x => {
        if (x.cat && !allCats().includes(x.cat)) state.cats[x.type].push(x.cat);
      });
      state.tx.push(...tx);
      toast(`${tx.length} movimientos importados${skipped ? ` · ${skipped} filas inválidas omitidas` : ''}`, 'upload');
    }
    setState(state); // asigna cuenta a lo importado sin una
    save();
    applyTheme();
    render();
  } catch (err) {
    toast('El archivo no tiene un formato válido', 'alert');
  }
};
$('btnReset').onclick = async () => {
  if (
    !(await ask({
      title: '¿Borrar todos los datos?',
      msg: 'Se eliminarán movimientos, presupuestos, recurrentes y metas. No se puede deshacer.',
      ok: 'Borrar todo',
      danger: true,
    }))
  )
    return;
  setState(structuredClone(DEFAULT));
  save();
  applyTheme();
  render();
  toast('Datos borrados', 'trash');
};
