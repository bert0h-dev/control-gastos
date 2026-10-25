import { state, $, esc, ic, save } from './core.js';
import { PALETTES, MODES, paletteById } from './logic/temas.js';
import { isDark, refreshTheme, toast } from './ui.js';

// ===== Apariencia: modo (sistema / claro / oscuro) y paleta =====
export function renderAppearance(){
  const mode = state.theme || 'system', dark = isDark(), current = paletteById(state.palette).id;
  $('modeSeg').innerHTML = Object.entries(MODES).map(([k, v]) =>
    `<button role="radio" data-mode="${k}" aria-pressed="${k === mode}" aria-checked="${k === mode}">${v}</button>`).join('');

  // Cada tarjeta muestra la paleta en el modo que se está viendo, como una cabecera en miniatura
  $('paletteList').innerHTML = PALETTES.map(p => {
    const t = p[dark ? 'dark' : 'light'], sel = p.id === current;
    return `<button class="pal ${sel ? 'sel' : ''}" role="radio" aria-checked="${sel}" data-palette="${p.id}" style="background:${t.surface};color:${t.fg};border-color:${sel ? t.accent : t.border}">
      <span class="pal-hd" style="background:${t['hd-bg']};color:${t['hd-fg']}">
        <i class="pal-mark" style="background:${t.gold}"></i><span class="pal-bal">$16,650</span>
        <span class="pal-chip" style="background:${t['hd-chip']};border-color:${t['hd-line']}"></span>
      </span>
      <span class="pal-body">
        <span class="pal-dots"><i style="background:${t.accent}"></i><i style="background:${t.gold}"></i><i style="background:${t['surface-2']};border:1px solid ${t.border}"></i></span>
        <b>${esc(p.name)}</b><small style="color:${t.muted}">${esc(p.desc)}</small>
      </span>
      ${sel ? `<span class="pal-check" style="background:${t.accent};color:${t['accent-fg']}">${ic('check')}</span>` : ''}
    </button>`;
  }).join('');
}

$('modeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  state.theme = b.dataset.mode === 'system' ? null : b.dataset.mode;
  save(); refreshTheme();
});
$('paletteList').addEventListener('click', e => {
  const b = e.target.closest('[data-palette]'); if (!b || b.dataset.palette === state.palette) return;
  state.palette = b.dataset.palette;
  save(); refreshTheme(); toast(`Paleta ${paletteById(state.palette).name}`, 'check');
});
// Si el modo cambia desde la cabecera o el sistema, las miniaturas se actualizan
document.addEventListener('themechange', renderAppearance);
