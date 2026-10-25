import { state, $, esc, ic, save, allCats, catColor } from './core.js';
import { renameCategory } from './logic/calculos.js';
import { toast, ask, undoable } from './ui.js';
import { render } from './render.js';

// ===== Categorías =====
export function renderCats(){
  const chip = t => state.cats[t].map((c,i) => `<span class="chip"><i class="swatch" style="background:${catColor(c)}"></i>${esc(c)}
    <button class="iconbtn" onclick="renameCat('${t}',${i})" aria-label="Renombrar ${esc(c)}">${ic('edit')}</button><button class="iconbtn del" onclick="delCat('${t}',${i})" aria-label="Eliminar ${esc(c)}">${ic('x')}</button></span>`).join('');
  $('catListG').innerHTML = chip('gasto'); $('catListI').innerHTML = chip('ingreso');
}
$('catForm').addEventListener('submit', e => {
  e.preventDefault(); const n = $('catName').value.trim(), t = $('catType').value;
  if (allCats().includes(n)) return toast('Esa categoría ya existe', 'alert');
  state.cats[t].push(n); $('catName').value = ''; save(); render(); toast('Categoría añadida');
});
window.renameCat = async (t, i) => {
  const old = state.cats[t][i];
  const name = await ask({ title: `Renombrar "${old}"`, msg: 'Se actualizan sus movimientos, presupuesto, recurrentes y subcategorías.', ok: 'Renombrar', input: 'text', value: old });
  if (!name || name === old) return;
  if (allCats().includes(name)) return toast('Esa categoría ya existe', 'alert');
  renameCategory(state, t, old, name); save(); render(); toast(`"${old}" ahora se llama "${name}"`);
};
window.delCat = (t, i) => {
  const c = state.cats[t][i];
  if (state.cats[t].length <= 1) return toast('Debe quedar al menos una categoría', 'alert');
  const used = state.tx.some(x => x.cat === c);
  undoable(`Categoría "${c}" eliminada${used ? '. Sus movimientos conservan el nombre' : ''}`, 'trash',
    () => { state.cats[t].splice(i, 1); delete state.budgets[c]; });
};
