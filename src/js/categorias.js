import { state, $, esc, ic, save, allCats, catColor } from './core.js';
import { toast, ask } from './ui.js';
import { render } from './render.js';

// ===== Categorías =====
export function renderCats(){
  const chip = t => state.cats[t].map((c,i) => `<span class="chip"><i class="swatch" style="background:${catColor(c)}"></i>${esc(c)}<button class="iconbtn del" onclick="delCat('${t}',${i})" aria-label="Eliminar ${esc(c)}">${ic('x')}</button></span>`).join('');
  $('catListG').innerHTML = chip('gasto'); $('catListI').innerHTML = chip('ingreso');
}
$('catForm').addEventListener('submit', e => {
  e.preventDefault(); const n = $('catName').value.trim(), t = $('catType').value;
  if (allCats().includes(n)) return toast('Esa categoría ya existe', 'alert');
  state.cats[t].push(n); $('catName').value = ''; save(); render(); toast('Categoría añadida');
});
window.delCat = async (t, i) => {
  const c = state.cats[t][i];
  if (state.cats[t].length <= 1) return toast('Debe quedar al menos una categoría', 'alert');
  const used = state.tx.some(x => x.cat === c);
  if (!await ask({title:`¿Eliminar "${c}"?`, msg: used ? 'Tiene movimientos; se conservarán con ese nombre.' : '', ok:'Eliminar', danger:true})) return;
  state.cats[t].splice(i,1); delete state.budgets[c]; save(); render();
};
