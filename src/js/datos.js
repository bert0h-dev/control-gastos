import { DEFAULT, state, $, today, save, allCats, setState, newId, accName } from './core.js';
import { toCsv, parseCsv, sanitizeBackup } from './logic/datos.js';
import { toast, ask, applyTheme } from './ui.js';
import { render } from './render.js';
import { filteredTx } from './movimientos.js';

// ===== Exportar / importar =====
export function download(name, content, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content],{type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('btnExportCsv').onclick = () => download(`gastos_${today()}.csv`, toCsv(filteredTx(), accName), 'text/csv');
// Nombre de cuenta del CSV -> id (sin distinguir mayúsculas)
const accountByName = name => state.accounts.find(a => a.name.toLowerCase() === String(name || '').trim().toLowerCase())?.id;
$('btnExportJson').onclick = () => { download(`respaldo_gastos_${today()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Respaldo descargado', 'download'); };
$('btnImport').onclick = () => $('fileImport').click();
$('fileImport').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text(); e.target.value = '';
  try {
    if (f.name.toLowerCase().endsWith('.json')) {
      const d = sanitizeBackup(JSON.parse(text), DEFAULT);
      if (!await ask({title:'¿Reemplazar tus datos?', msg:`El respaldo trae ${d.tx.length} movimientos y sustituirá todo lo actual.`, ok:'Reemplazar', danger:true})) return;
      setState(d);
      toast('Respaldo restaurado');
    } else {
      const { tx, skipped } = parseCsv(text, newId, accountByName);
      tx.forEach(x => { if (x.cat && !allCats().includes(x.cat)) state.cats[x.type].push(x.cat); });
      state.tx.push(...tx);
      toast(`${tx.length} movimientos importados${skipped ? ` · ${skipped} filas inválidas omitidas` : ''}`, 'upload');
    }
    setState(state); // asigna cuenta a lo importado sin una
    save(); applyTheme(); render();
  } catch(err){ toast('El archivo no tiene un formato válido', 'alert'); }
};
$('btnReset').onclick = async () => {
  if (!await ask({title:'¿Borrar todos los datos?', msg:'Se eliminarán movimientos, presupuestos, recurrentes y metas. No se puede deshacer.', ok:'Borrar todo', danger:true})) return;
  setState(structuredClone(DEFAULT)); save(); applyTheme(); render(); toast('Datos borrados', 'trash');
};
