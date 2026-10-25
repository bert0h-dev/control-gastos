// Revisión visual: abre la página en Edge, carga datos de ejemplo y toma capturas en ./capturas
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, 'capturas');
fs.mkdirSync(out, { recursive: true });

// Datos de ejemplo relativos al mes actual
function sample() {
  const d = new Date(), ym = o => { const x = new Date(d.getFullYear(), d.getMonth() + o, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  const tx = []; let id = 1;
  const add = (o, day, type, desc, cat, amount, method = 'Tarjeta de débito', extra = {}) => tx.push({ id: id++, date: `${ym(o)}-${String(day).padStart(2, '0')}`, type, desc, cat, amount, method, note: '', ...extra });
  const today = d.getDate();
  for (let o = -5; o <= 0; o++) {
    add(o, 1, 'ingreso', 'Salario', 'Salario', 28000, 'Transferencia');
    add(o, 2, 'gasto', 'Renta', 'Vivienda', 9500, 'Transferencia');
    add(o, 5, 'gasto', 'Supermercado', 'Alimentación', 3200 + o * 150, 'Tarjeta de débito', { sub: 'Súper' });
    add(o, 8, 'gasto', 'Gasolina', 'Transporte', 1400 - o * 60, 'Efectivo');
    add(o, 10, 'gasto', 'Luz e internet', 'Servicios', 1150);
    if (o % 2 === 0) add(o, 12, 'ingreso', 'Proyecto web', 'Freelance', 6500, 'Transferencia');
    add(o, Math.min(today, 14), 'gasto', 'Cine y cena', 'Entretenimiento', o === 0 ? 2600 : 900, 'Tarjeta de crédito', { tags: o === -1 ? ['viaje'] : [] });
    if (o < 0) tx.push({ id: id++, date: `${ym(o + 1)}-03`, type: 'transferencia', desc: 'Pago tarjeta', amount: 900, account: 'banco', to: 'tarjeta', note: '' });
  }
  add(-1, 20, 'gasto', 'Hotel Cancún', 'Entretenimiento', 4200, 'Tarjeta de crédito', { tags: ['viaje'], sub: 'Viajes' });
  return {
    tx, budgets: { 'Alimentación': 3500, 'Entretenimiento': 2000, 'Transporte': 1500 },
    recurring: [{ id: 99, type: 'gasto', desc: 'Netflix', amount: 299, day: 15, cat: 'Entretenimiento', method: 'Tarjeta de crédito', start: ym(1), lastGen: null, active: true }],
    goals: [{ id: 7, name: 'Vacaciones', target: 20000, saved: 8500, deadline: ym(4) }],
    cats: { gasto: ['Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Ropa', 'Otros'], ingreso: ['Salario', 'Freelance', 'Inversiones', 'Regalos', 'Otros ingresos'] },
    theme: null
  };
}

(async () => {
  // Levanta el servidor de desarrollo de Vite en un puerto libre
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 5174 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ channel: 'msedge' });
  const errors = [];
  for (const [name, vp, scheme] of [['escritorio-claro', { width: 1280, height: 900 }, 'light'], ['escritorio-oscuro', { width: 1280, height: 900 }, 'dark'], ['celular', { width: 390, height: 844 }, 'light']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
    page.on('console', m => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
    await page.addInitScript(d => { if (!sessionStorage.seeded) { localStorage.setItem('controlGastos.v1', d); sessionStorage.seeded = 1; } }, JSON.stringify(sample()));
    await page.goto(url + '#resumen');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${name}-resumen.png`), fullPage: true });
    for (const t of ['movimientos', 'cuentas', 'analisis', 'presupuestos', 'recurrentes', 'metas', 'ajustes']) {
      await page.click(`.tab[data-tab="${t}"]`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `${name}-${t}.png`), fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errors.push(`[${name}] scroll horizontal en ${t}`);
    }
    // Flujo: transferencia del banco a la tarjeta
    try {
      await page.click('#btnNew');
      await page.click('label[for="tT"]');
      await page.fill('#txAmount', '1000', { timeout: 3000 });
      await page.fill('#txDesc', 'Pago de prueba');
      await page.selectOption('#txAccount', 'banco');
      await page.selectOption('#txTo', 'tarjeta');
      await page.click('#btnSave');
      await page.click('.tab[data-tab="cuentas"]');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(out, `${name}-cuentas-tras-pago.png`), fullPage: true });
    } catch (e) { errors.push(`[${name}] no se pudo registrar la transferencia: ${e.message.split('\n')[0]}`); }
    // Flujo: registrar un gasto desde el modal
    try {
      await page.click('#btnNew');
      await page.fill('#txAmount', '450', { timeout: 3000 });
      await page.fill('#txDesc', 'Prueba automática');
      await page.screenshot({ path: path.join(out, `${name}-modal.png`) });
      await page.click('#btnSave');
    } catch (e) { errors.push(`[${name}] no se pudo registrar desde el modal: ${e.message.split('\n')[0]}`); }
    const ok = await page.locator('.tx .meta b', { hasText: 'Prueba automática' }).count();
    if (!ok) errors.push(`[${name}] el movimiento nuevo no apareció en la lista`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) errors.push(`[${name}] la página tiene scroll horizontal`);
    await ctx.close();
  }
  await browser.close();
  await server.close();
  console.log(errors.length ? 'PROBLEMAS:\n' + errors.join('\n') : 'Sin errores. Capturas en ./capturas');
})();
