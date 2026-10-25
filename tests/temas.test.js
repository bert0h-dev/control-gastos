import { describe, it, expect } from 'vitest';
import { PALETTES, TOKENS, themeTokens, isDarkMode, contrast, paletteById } from '../src/js/logic/temas.js';

describe('temas', () => {
  it('cada paleta define todos los tokens en claro y oscuro', () => {
    for (const p of PALETTES) for (const mode of ['light', 'dark'])
      expect(Object.keys(p[mode]).sort(), `${p.id}/${mode}`).toEqual([...TOKENS].sort());
  });

  // Contraste mínimo WCAG AA: 4.5 para texto normal, 3 para elementos grandes o secundarios
  it.each(PALETTES.flatMap(p => ['light', 'dark'].map(m => [p.id, m])))('%s en modo %s es legible', (id, mode) => {
    const t = paletteById(id)[mode];
    expect(contrast(t.fg, t.bg), 'texto sobre fondo').toBeGreaterThanOrEqual(7);
    expect(contrast(t.fg, t.surface), 'texto sobre tarjeta').toBeGreaterThanOrEqual(7);
    expect(contrast(t.muted, t.surface), 'texto secundario').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['accent-fg'], t.accent), 'texto de botón').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['gold-fg'], t.gold), 'texto sobre dorado').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['hd-fg'], t['hd-bg']), 'texto de cabecera').toBeGreaterThanOrEqual(7);
    expect(contrast(t['hd-muted'], t['hd-chip']), 'etiquetas de cabecera').toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.accent, t.surface), 'acento como texto').toBeGreaterThanOrEqual(3);
  });

  it('resuelve el modo según la preferencia del sistema', () => {
    expect(isDarkMode('system', true)).toBe(true);
    expect(isDarkMode('system', false)).toBe(false);
    expect(isDarkMode('light', true)).toBe(false);
    expect(isDarkMode('dark', false)).toBe(true);
  });

  it('una paleta desconocida cae en la primera', () => {
    expect(themeTokens('no-existe', false)).toBe(PALETTES[0].light);
  });

  it('calcula contraste WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});
