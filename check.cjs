// Revisión visual: abre la página en Edge, carga datos de ejemplo y toma capturas en ./capturas
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, 'capturas');
fs.mkdirSync(out, { recursive: true });

// Datos de ejemplo relativos al mes actual
function sample() {
  const d = new Date(),
    ym = o => {
      const x = new Date(d.getFullYear(), d.getMonth() + o, 1);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
    };
  const tx = [];
  let id = 1;
  const add = (o, day, type, desc, cat, amount, method = 'Tarjeta de débito', extra = {}) =>
    tx.push({ id: id++, date: `${ym(o)}-${String(day).padStart(2, '0')}`, type, desc, cat, amount, method, note: '', ...extra });
  const today = d.getDate();
  for (let o = -5; o <= 0; o++) {
    add(o, 1, 'ingreso', 'Salario', 'Salario', 28000, 'Transferencia');
    add(o, 2, 'gasto', 'Renta', 'Vivienda', 9500, 'Transferencia');
    add(o, 5, 'gasto', 'Supermercado', 'Alimentación', 3200 + o * 150, 'Tarjeta de débito', { sub: 'Súper' });
    add(o, 8, 'gasto', 'Gasolina', 'Transporte', 1400 - o * 60, 'Efectivo');
    add(o, 10, 'gasto', 'Luz e internet', 'Servicios', 1150);
    if (o % 2 === 0) add(o, 12, 'ingreso', 'Proyecto web', 'Freelance', 6500, 'Transferencia');
    add(o, Math.min(today, 14), 'gasto', 'Cine y cena', 'Entretenimiento', o === 0 ? 2600 : 900, 'Tarjeta de crédito', {
      tags: o === -1 ? ['viaje'] : [],
    });
    if (o < 0)
      tx.push({
        id: id++,
        date: `${ym(o + 1)}-03`,
        type: 'transferencia',
        desc: 'Pago tarjeta',
        amount: 900,
        account: 'banco',
        to: 'tarjeta',
        note: '',
      });
  }
  add(-1, 20, 'gasto', 'Hotel Cancún', 'Entretenimiento', 4200, 'Tarjeta de crédito', { tags: ['viaje'], sub: 'Viajes' });
  return {
    tx,
    budgets: { Alimentación: 3500, Entretenimiento: 2000, Transporte: 1500 },
    recurring: [
      {
        id: 99,
        type: 'gasto',
        desc: 'Netflix',
        amount: 299,
        day: 15,
        cat: 'Entretenimiento',
        method: 'Tarjeta de crédito',
        start: ym(1),
        lastGen: null,
        active: true,
      },
    ],
    goals: [{ id: 7, name: 'Vacaciones', target: 20000, saved: 8500, deadline: ym(4) }],
    cats: {
      gasto: ['Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Ropa', 'Otros'],
      ingreso: ['Salario', 'Freelance', 'Inversiones', 'Regalos', 'Otros ingresos'],
    },
    theme: null,
  };
}

(async () => {
  // Base de datos temporal: la revisión nunca toca data/gastos.db
  // Base y respaldos en una carpeta temporal propia, que se borra al terminar
  const tmpRoot = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gastos-check-'));
  process.env.GASTOS_DB = path.join(tmpRoot, 'gastos.db');
  process.env.GASTOS_RESPALDOS = path.join(tmpRoot, 'respaldos');
  // Levanta el servidor de desarrollo de Vite (con la API de SQLite) en un puerto fijo
  const { createServer } = await import('vite');
  const server = await createServer({ root: __dirname, server: { host: '127.0.0.1', port: 5174 }, logLevel: 'error' });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  // En tu PC usa el Edge instalado; en GitHub Actions (CI=true) usa el Chromium que instala el workflow
  const browser = await chromium.launch(process.env.CI ? {} : { channel: 'msedge' });
  const errors = [];
  let runs = 0;
  for (const [name, vp, scheme] of [
    ['escritorio-claro', { width: 1280, height: 900 }, 'light'],
    ['escritorio-oscuro', { width: 1280, height: 900 }, 'dark'],
    ['celular', { width: 390, height: 844 }, 'light'],
  ]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
    page.on('console', m => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
    await page.addInitScript(d => {
      if (!sessionStorage.seeded) {
        localStorage.setItem('controlGastos.v1', d);
        sessionStorage.seeded = 1;
      }
    }, JSON.stringify(sample()));
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
    } catch (e) {
      errors.push(`[${name}] no se pudo registrar la transferencia: ${e.message.split('\n')[0]}`);
    }
    // Flujo: eliminar un movimiento y deshacerlo
    try {
      await page.click('.tab[data-tab="movimientos"]');
      const before = await page.locator('.tx').count();
      await page.locator('.tx .iconbtn.del').first().click();
      if ((await page.locator('.tx').count()) !== before - 1) errors.push(`[${name}] eliminar no quitó el movimiento`);
      await page.click('.toast-btn', { timeout: 3000 });
      if ((await page.locator('.tx').count()) !== before) errors.push(`[${name}] deshacer no restauró el movimiento`);
    } catch (e) {
      errors.push(`[${name}] falló eliminar/deshacer: ${e.message.split('\n')[0]}`);
    }
    // Flujo: editar el monto de un recurrente
    try {
      await page.click('.tab[data-tab="recurrentes"]');
      await page.locator('#recList [aria-label="Editar"]').first().click();
      await page.fill('#rAmount', '349', { timeout: 3000 });
      await page.click('#rSave');
      if (!(await page.textContent('#recList')).includes('349.00')) errors.push(`[${name}] el recurrente no se actualizó`);
    } catch (e) {
      errors.push(`[${name}] falló editar recurrente: ${e.message.split('\n')[0]}`);
    }
    // Flujo: registrar un gasto desde el modal
    try {
      await page.click('#btnNew');
      await page.fill('#txAmount', '450', { timeout: 3000 });
      await page.fill('#txDesc', 'Prueba automática');
      await page.screenshot({ path: path.join(out, `${name}-modal.png`) });
      await page.click('#btnSave');
    } catch (e) {
      errors.push(`[${name}] no se pudo registrar desde el modal: ${e.message.split('\n')[0]}`);
    }
    const ok = await page.locator('.tx .meta b', { hasText: 'Prueba automática' }).count();
    if (!ok) errors.push(`[${name}] el movimiento nuevo no apareció en la lista`);
    // Persistencia: el gasto debe estar en SQLite y seguir ahí al recargar la página
    await page.waitForTimeout(800); // el guardado se agrupa durante 300 ms
    const api = await (await fetch(url + 'api/state')).json();
    const inDb = api.state?.tx.filter(x => x.desc === 'Prueba automática').length || 0;
    if (inDb !== runs + 1) errors.push(`[${name}] SQLite tiene ${inDb} movimientos de prueba; se esperaban ${runs + 1}`);
    if (runs === 0 && !api.state?.budgetPlans?.[0]?.limits?.['Alimentación'])
      errors.push(`[${name}] los límites de presupuesto del navegador no llegaron a SQLite`);
    if (runs === 0 && !(api.state?.tx.length >= 45)) errors.push(`[${name}] no se importaron a SQLite los datos del navegador`);
    await page.reload();
    await page.waitForTimeout(600);
    await page.click('.tab[data-tab="movimientos"]');
    if (!(await page.locator('.tx .meta b', { hasText: 'Prueba automática' }).count()))
      errors.push(`[${name}] tras recargar, el movimiento no está`);
    if (!(await page.textContent('#syncTitle')).includes('Guardado')) errors.push(`[${name}] el indicador no muestra conexión con la base`);
    runs++;
    // Seguridad: un nombre con comillas y paréntesis no debe romper ni ejecutar nada (antes iba dentro de onclick)
    try {
      const evil = `Rara "x" ')alert(1)//`;
      let dialog = false;
      page.once('dialog', d => ((dialog = true), d.dismiss()));
      await page.click('.tab[data-tab="ajustes"]');
      await page.fill('#catName', evil);
      await page.click('#catForm button[type="submit"]');
      const chip = page.locator('#catListG .chip', { hasText: 'Rara' });
      if ((await chip.count()) !== 1) errors.push(`[${name}] no se creó la categoría con comillas`);
      await chip.locator('[data-action="delCat"]').click();
      if (await page.locator('#catListG .chip', { hasText: 'Rara' }).count())
        errors.push(`[${name}] no se pudo borrar la categoría con comillas`);
      await page.click('.toast-btn');
      if ((await page.locator('#catListG .chip', { hasText: 'Rara' }).count()) !== 1)
        errors.push(`[${name}] deshacer no restauró la categoría`);
      if (dialog) errors.push(`[${name}] el nombre de la categoría ejecutó código`);
      await page.locator('#catListG .chip', { hasText: 'Rara' }).locator('[data-action="delCat"]').click();
    } catch (e) {
      errors.push(`[${name}] falló la prueba de categoría con comillas: ${e.message.split('\n')[0]}`);
    }
    // Flujo: cambiar paleta y modo desde Ajustes; captura de cada paleta (solo en escritorio claro)
    try {
      await page.click('.tab[data-tab="ajustes"]');
      const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      const before = await accent();
      const target = (await page.getAttribute('.pal.sel', 'data-palette')) === 'oceano' ? 'ciruela' : 'oceano';
      await page.click(`.pal[data-palette="${target}"]`);
      if ((await accent()) === before) errors.push(`[${name}] cambiar de paleta no cambió los colores`);
      if (name === 'escritorio-claro') {
        for (const p of ['esmeralda', 'oceano', 'ciruela', 'terracota', 'grafito'])
          for (const m of ['light', 'dark']) {
            await page.click(`.pal[data-palette="${p}"]`);
            await page.click(`[data-mode="${m}"]`);
            await page.click('.tab[data-tab="resumen"]');
            await page.waitForTimeout(150);
            await page.screenshot({ path: path.join(out, `tema-${p}-${m}.png`) });
            await page.click('.tab[data-tab="ajustes"]');
          }
        await page.screenshot({ path: path.join(out, `${name}-apariencia.png`), fullPage: true });
        await page.click('[data-mode="system"]');
        await page.click('.pal[data-palette="esmeralda"]');
      }
      await page.waitForTimeout(500);
      const saved = (await (await fetch(url + 'api/state')).json()).state;
      if (name !== 'escritorio-claro' && saved.palette !== target)
        errors.push(`[${name}] la paleta no se guardó en SQLite (${saved.palette})`);
    } catch (e) {
      errors.push(`[${name}] falló el cambio de tema: ${e.message.split('\n')[0]}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) errors.push(`[${name}] la página tiene scroll horizontal`);
    await ctx.close();
  }
  // Dos dispositivos a la vez: cada contexto es un navegador independiente (su propio localStorage)
  try {
    const [ca, cb] = [await browser.newContext(), await browser.newContext()];
    const [a, b] = [await ca.newPage(), await cb.newPage()];
    const puts = [];
    for (const p of [a, b]) {
      p.on('pageerror', e => errors.push(`[dos dispositivos] ${e.message}`));
      p.on('request', r => r.url().includes('/api/state') && r.method() === 'PUT' && puts.push(r.url()));
    }
    await Promise.all([a.goto(url + '#movimientos'), b.goto(url + '#movimientos')]);
    await a.waitForTimeout(600);
    const add = async (p, desc) => {
      await p.click('#btnNew');
      await p.fill('#txAmount', '10');
      await p.fill('#txDesc', desc);
      await p.click('#btnSave');
    };
    // Los dos registran casi al mismo tiempo, sin haber visto el cambio del otro
    await Promise.all([add(a, 'Desde dispositivo A'), add(b, 'Desde dispositivo B')]);
    await a.waitForTimeout(1200);
    const db = (await (await fetch(url + 'api/state')).json()).state.tx.map(x => x.desc);
    for (const d of ['Desde dispositivo A', 'Desde dispositivo B'])
      if (!db.includes(d)) errors.push(`[dos dispositivos] SQLite perdió "${d}"`);
    // Cada uno revisa si hay cambios (normalmente cada 15 s o al volver a la pestaña) y debe ver lo del otro
    for (const p of [a, b]) await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await a.waitForTimeout(1200);
    for (const [p, other] of [
      [a, 'Desde dispositivo B'],
      [b, 'Desde dispositivo A'],
    ])
      if (!(await p.locator('.tx .meta b', { hasText: other }).count())) errors.push(`[dos dispositivos] no se ve "${other}" en el otro`);
    if (puts.length) errors.push(`[dos dispositivos] se envió el estado completo ${puts.length} vez/veces en lugar de solo cambios`);
    await a.screenshot({ path: path.join(out, 'dos-dispositivos-a.png'), fullPage: true });
    await ca.close();
    await cb.close();
  } catch (e) {
    errors.push(`[dos dispositivos] ${e.message.split('\n')[0]}`);
  }

  // Presupuestos con historial: cambiar un límite este mes no altera el anterior
  try {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`[presupuestos] ${e.message}`));
    await p.goto(url + '#presupuestos');
    await p.waitForTimeout(800);
    const limitOf = async cat =>
      (await p.locator('#budgetBars .bar-row', { hasText: cat }).locator('.r').textContent()).split('/')[1].trim();
    const before = await limitOf('Alimentación');
    await p.locator('#bCat').selectOption('Alimentación');
    await p.fill('#bAmount', '4321');
    await p.click('#budgetForm button[type="submit"]');
    if (!(await limitOf('Alimentación')).includes('4,321')) errors.push('[presupuestos] el límite nuevo no se aplicó este mes');
    await p.click('#mPrev');
    if ((await limitOf('Alimentación')) !== before) errors.push('[presupuestos] cambiar el límite alteró el mes anterior');
    // El mes anterior ahora es distinto al actual: debe ofrecer copiar al mes siguiente
    if (await p.locator('#budCopy').isHidden()) errors.push('[presupuestos] no se ofrece copiar los límites al mes siguiente');
    await p.click('#btnBudCopy');
    await p.click('#mNext');
    if ((await limitOf('Alimentación')) !== before) errors.push('[presupuestos] copiar al mes siguiente no igualó los límites');
    const rows = await p.locator('#budHist tbody tr').count();
    if (rows < 3) errors.push(`[presupuestos] el historial muestra ${rows} categorías; se esperaban al menos 3`);
    await p.click('#budRange [data-n="12"]');
    if ((await p.locator('#budHist thead th').count()) !== 14)
      errors.push('[presupuestos] el historial de 12 meses no muestra 12 columnas');
    await p.screenshot({ path: path.join(out, 'presupuestos-historial.png'), fullPage: true });
    await ctx.close();
  } catch (e) {
    errors.push(`[presupuestos] ${e.message.split('\n')[0]}`);
    await browser
      .contexts()
      .at(-1)
      ?.pages()[0]
      ?.screenshot({ path: path.join(out, 'presupuestos-error.png'), fullPage: true });
  }

  // Respaldos: el diario existe, se puede crear uno manual, descargar la base y restaurar
  try {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`[respaldos] ${e.message}`));
    await p.goto(url + '#ajustes');
    await p.waitForTimeout(800);
    const items = () => p.locator('#bkList .bk').count();
    const before = await items();
    if (before < 1) errors.push('[respaldos] no se creó el respaldo diario');
    await p.click('#btnBackupNow');
    await p.waitForTimeout(500);
    if ((await items()) !== before + 1) errors.push('[respaldos] "Crear respaldo ahora" no agregó uno a la lista');
    const db = Buffer.from(await (await fetch(url + 'api/backups/actual')).arrayBuffer());
    if (!db.subarray(0, 15).toString().startsWith('SQLite format 3'))
      errors.push('[respaldos] la descarga de la base no es un archivo SQLite');
    const bad = await fetch(url + 'api/backups/..%2Fgastos.db');
    if (bad.status !== 400) errors.push(`[respaldos] una ruta con ../ respondió ${bad.status} en lugar de 400`);
    // Restaurar el diario (anterior a los gastos de prueba): esos gastos deben desaparecer
    const { backups } = await (await fetch(url + 'api/backups')).json();
    const daily = backups.filter(b => b.kind === 'diario').pop();
    await p.click(`[data-action="restoreBackup"][data-name="${daily.name}"]`);
    await p.click('#dlgOk');
    await p.waitForTimeout(2000);
    const after = (await (await fetch(url + 'api/state')).json()).state.tx.map(x => x.desc);
    if (after.includes('Prueba automática')) errors.push('[respaldos] restaurar no regresó los datos al respaldo');
    const list = (await (await fetch(url + 'api/backups')).json()).backups;
    if (!list.some(b => b.kind === 'antes-de-restaurar')) errors.push('[respaldos] no se guardó una copia antes de restaurar');
    await p.click('.tab[data-tab="movimientos"]');
    await p.locator('#fPeriod').selectOption('todo');
    if (await p.locator('.tx .meta b', { hasText: 'Prueba automática' }).count())
      errors.push('[respaldos] tras restaurar, la pantalla sigue mostrando datos viejos');
    await p.click('.tab[data-tab="ajustes"]');
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, 'respaldos.png'), fullPage: true });
    // Los diálogos de confirmación sin campo de texto deben abrirse (antes fallaban por maxLength = -1)
    await p.click('#btnReset');
    if (await p.locator('#dlg').isHidden()) errors.push('[diálogos] "Borrar todos los datos" no abrió la confirmación');
    else await p.click('#dlgCancel');
    await ctx.close();
  } catch (e) {
    errors.push(`[respaldos] ${e.message.split('\n')[0]}`);
  }

  await browser.close();
  await server.close();
  // En Windows la base sigue abierta por el servidor de Vite hasta que termina el proceso; si no se puede borrar
  // ahora, se queda en la carpeta temporal del sistema (no afecta la revisión)
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}
  console.log(errors.length ? 'PROBLEMAS:\n' + errors.join('\n') : 'Sin errores. Capturas en ./capturas');
  // Código de salida distinto de 0 si hubo problemas, para que CI marque la revisión como fallida
  process.exitCode = errors.length ? 1 : 0;
})();
