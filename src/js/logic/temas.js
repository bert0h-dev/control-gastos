// Paletas de color. Cada una define sus tokens para modo claro y oscuro; los colores
// semánticos (--pos, --neg, --warn) no cambian entre paletas para que verde y rojo signifiquen siempre lo mismo.
// Para agregar una paleta basta con añadir un objeto aquí.

export const MODES = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };

// Tokens que cada paleta debe definir (los consume src/css/styles.css)
export const TOKENS = ['bg','surface','surface-2','fg','muted','border','accent','accent-fg','gold','gold-fg',
  'hd-bg','hd-fg','hd-muted','hd-line','hd-chip'];

export const PALETTES = [
  { id: 'esmeralda', name: 'Esmeralda', desc: 'Verde banco con dorado',
    light: { bg:'#f3f5f2', surface:'#ffffff', 'surface-2':'#eef1ec', fg:'#18201b', muted:'#5f6b63', border:'#dde3dc',
      accent:'#0f6b4f', 'accent-fg':'#ffffff', gold:'#d9a521', 'gold-fg':'#1a1404',
      'hd-bg':'#0d1f19', 'hd-fg':'#eef5f0', 'hd-muted':'#9db3a6', 'hd-line':'#2a4a3d', 'hd-chip':'#173a2e' },
    dark: { bg:'#0e1411', surface:'#161e1a', 'surface-2':'#1d2722', fg:'#e7eee9', muted:'#93a39a', border:'#27332d',
      accent:'#3fbf8c', 'accent-fg':'#06140e', gold:'#e8b93a', 'gold-fg':'#1a1404',
      'hd-bg':'#08130f', 'hd-fg':'#eef5f0', 'hd-muted':'#8fa79a', 'hd-line':'#1f3a2f', 'hd-chip':'#11291f' } },

  { id: 'oceano', name: 'Océano', desc: 'Azul profundo con turquesa',
    light: { bg:'#f2f5f9', surface:'#ffffff', 'surface-2':'#e9eef5', fg:'#141c27', muted:'#5a6878', border:'#d9e1ec',
      accent:'#1d5fd1', 'accent-fg':'#ffffff', gold:'#2bb6c9', 'gold-fg':'#03242a',
      'hd-bg':'#0b1a2e', 'hd-fg':'#eaf2fb', 'hd-muted':'#93a8c2', 'hd-line':'#213a5c', 'hd-chip':'#132a4a' },
    dark: { bg:'#0a1019', surface:'#111a26', 'surface-2':'#192433', fg:'#e6edf6', muted:'#8e9db0', border:'#243042',
      accent:'#5b9cff', 'accent-fg':'#061226', gold:'#45d0e3', 'gold-fg':'#03242a',
      'hd-bg':'#060e1a', 'hd-fg':'#eaf2fb', 'hd-muted':'#8299b6', 'hd-line':'#1a2e4a', 'hd-chip':'#0f203a' } },

  { id: 'ciruela', name: 'Ciruela', desc: 'Morado con ámbar',
    light: { bg:'#f6f3f7', surface:'#ffffff', 'surface-2':'#efe9f1', fg:'#221a26', muted:'#6b5f70', border:'#e3dae6',
      accent:'#7b3fa0', 'accent-fg':'#ffffff', gold:'#e8a33d', 'gold-fg':'#2a1802',
      'hd-bg':'#1e1027', 'hd-fg':'#f5eef8', 'hd-muted':'#b29fbd', 'hd-line':'#3d2a4a', 'hd-chip':'#2c1a38' },
    dark: { bg:'#120d15', surface:'#1b1420', 'surface-2':'#241b2a', fg:'#efe8f2', muted:'#a395aa', border:'#33283a',
      accent:'#c08ae6', 'accent-fg':'#1d0b29', gold:'#f2b55a', 'gold-fg':'#2a1802',
      'hd-bg':'#0d0811', 'hd-fg':'#f5eef8', 'hd-muted':'#a08faa', 'hd-line':'#2e2038', 'hd-chip':'#1f1428' } },

  { id: 'terracota', name: 'Terracota', desc: 'Barro cálido con mostaza',
    light: { bg:'#f7f3ef', surface:'#ffffff', 'surface-2':'#f0e9e2', fg:'#251a14', muted:'#6f6058', border:'#e6dcd3',
      accent:'#b4532a', 'accent-fg':'#ffffff', gold:'#e3b23c', 'gold-fg':'#2a1d02',
      'hd-bg':'#2a140c', 'hd-fg':'#faf0ea', 'hd-muted':'#c4a596', 'hd-line':'#4a2c1f', 'hd-chip':'#3a1f14' },
    dark: { bg:'#140e0b', surface:'#1e1612', 'surface-2':'#281e18', fg:'#f2e9e3', muted:'#ab9a90', border:'#3a2c24',
      accent:'#ec8a5c', 'accent-fg':'#2a0f03', gold:'#efc35a', 'gold-fg':'#2a1d02',
      'hd-bg':'#0f0906', 'hd-fg':'#faf0ea', 'hd-muted':'#a88e80', 'hd-line':'#3a2318', 'hd-chip':'#26170f' } },

  { id: 'grafito', name: 'Grafito', desc: 'Gris neutro con naranja',
    light: { bg:'#f4f4f5', surface:'#ffffff', 'surface-2':'#ececee', fg:'#18181b', muted:'#62636b', border:'#dedee2',
      accent:'#2f3640', 'accent-fg':'#ffffff', gold:'#ff8a3d', 'gold-fg':'#2b1200',
      'hd-bg':'#16181c', 'hd-fg':'#f2f2f4', 'hd-muted':'#a1a3ab', 'hd-line':'#30333a', 'hd-chip':'#22252b' },
    dark: { bg:'#0f1012', surface:'#17181b', 'surface-2':'#202226', fg:'#ececee', muted:'#9a9ca4', border:'#2c2e33',
      accent:'#d4d7de', 'accent-fg':'#111215', gold:'#ff9a52', 'gold-fg':'#2b1200',
      'hd-bg':'#0a0b0d', 'hd-fg':'#f2f2f4', 'hd-muted':'#8c8f97', 'hd-line':'#26282d', 'hd-chip':'#18191d' } },
];

export const DEFAULT_PALETTE = 'esmeralda';
export const paletteById = id => PALETTES.find(p => p.id === id) || PALETTES[0];

// Tokens a aplicar para una paleta y un modo ya resuelto (claro u oscuro)
export const themeTokens = (paletteId, dark) => paletteById(paletteId)[dark ? 'dark' : 'light'];

// ¿Se ve oscuro? 'system' depende de la preferencia del sistema operativo
export const isDarkMode = (mode, systemDark) => mode === 'dark' || (mode !== 'light' && systemDark);

// Contraste WCAG entre dos colores hex (1 a 21); se usa en las pruebas para no publicar paletas ilegibles
export function contrast(a, b){
  const lum = hex => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
