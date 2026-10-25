import { state, $, esc, ic, save, allCats, catColor } from './core.js';
import { renameCategory } from './logic/calculos.js';
import { toast, ask, undoable, action } from './ui.js';
import { render } from './render.js';

// ===== Categorías =====
export function renderCats() {
  const chip = t =>
    state.cats[t]
      .map(
        c => `<span class="chip"><i class="swatch" style="background:${catColor(c)}"></i>${esc(c)}
    <button class="iconbtn" data-action="renameCat" data-type="${t}" data-cat="${esc(c)}" aria-label="Renombrar ${esc(c)}">${ic('edit')}</button><button class="iconbtn del" data-action="delCat" data-type="${t}" data-cat="${esc(c)}" aria-label="Eliminar ${esc(c)}">${ic('x')}</button></span>`
      )
      .join('');
  $('catListG').innerHTML = chip('gasto');
  $('catListI').innerHTML = chip('ingreso');
}
$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const n = $('catName').value.trim(),
    t = $('catType').value;
  if (allCats().includes(n)) return toast('Esa categoría ya existe', 'alert');
  state.cats[t].push(n);
  $('catName').value = '';
  save();
  render();
  toast('Categoría añadida');
});
// Las categorías se identifican por nombre (no por posición): si la lista cambia, siguen apuntando a la correcta
action('renameCat', async ({ type: t, cat: old }) => {
  if (!state.cats[t]?.includes(old)) return;
  const name = await ask({
    title: `Renombrar "${old}"`,
    msg: 'Se actualizan sus movimientos, presupuesto, recurrentes y subcategorías.',
    ok: 'Renombrar',
    input: 'text',
    value: old,
  });
  if (!name || name === old) return;
  if (allCats().includes(name)) return toast('Esa categoría ya existe', 'alert');
  renameCategory(state, t, old, name);
  save();
  render();
  toast(`"${old}" ahora se llama "${name}"`);
});
action('delCat', ({ type: t, cat: c }) => {
  const i = state.cats[t]?.indexOf(c) ?? -1;
  if (i < 0) return;
  if (state.cats[t].length <= 1) return toast('Debe quedar al menos una categoría', 'alert');
  const used = state.tx.some(x => x.cat === c);
  undoable(`Categoría "${c}" eliminada${used ? '. Sus movimientos conservan el nombre' : ''}`, 'trash', () => {
    state.cats[t].splice(state.cats[t].indexOf(c), 1);
    delete state.budgets[c];
  });
});
