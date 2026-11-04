/*
 * Rehace las capturas de docs/capturas y docs/factura-ejemplo.pdf con los DATOS DE EJEMPLO (inventados)
 * de la app (botón «Ver un ejemplo»). Nunca uses datos reales: el repositorio es público.
 *   node herramientas/generar-capturas.cjs
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CAPTURAS = path.join(RAIZ, 'docs', 'capturas');
const URL_APP = 'file://' + path.join(RAIZ, 'index.html');
const HOY = new Date('2026-11-02T10:00:00');

async function contexto(browser, opciones, oscuro) {
  const ctx = await browser.newContext({ ...opciones, acceptDownloads: true, locale: 'es-ES', colorScheme: oscuro ? 'dark' : 'light' });
  // Capturas con datos de ejemplo y SIN cuentas ('null' desactiva config-nube.js en este navegador).
  await ctx.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); localStorage.setItem('facturacion.nube.prueba', 'null'); } catch (e) { /* nada */ } });
  await ctx.clock.setFixedTime(HOY);
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(URL_APP);
  await p.click('#btn-ejemplo');
  await p.mouse.move(0, 0);       // que el ratón no deje abierto el detalle del gráfico
  await p.waitForTimeout(3400);   // que se vaya el aviso flotante
  return { ctx, p };
}
const ir = async (p, vista) => { await p.click(`.nav-item[data-ir=${vista}]`); await p.mouse.move(0, 0); await p.waitForTimeout(300); };
const reducir = (archivo) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', archivo, '-vf', 'scale=iw/2:-1', archivo + '.tmp.png']) && fs.renameSync(archivo + '.tmp.png', archivo);

(async () => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  for (const f of fs.readdirSync(CAPTURAS)) if (f.endsWith('.png')) fs.unlinkSync(path.join(CAPTURAS, f));
  const browser = await chromium.launch();

  // Ordenador
  const { ctx, p } = await contexto(browser, { viewport: { width: 1440, height: 1000 } });
  await p.screenshot({ path: path.join(CAPTURAS, 'inicio.png') });
  await ir(p, 'facturas');
  await p.screenshot({ path: path.join(CAPTURAS, 'facturas.png') });
  await p.click('#c-lista .item-factura:has-text("A 15/26") [data-abrir]');
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#f-concepto').scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: path.join(CAPTURAS, 'nueva-factura.png') });
  await p.click('#btn-pdf');
  await p.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#pdf-descargar')]);
  fs.copyFileSync(await d.path(), path.join(RAIZ, 'docs', 'factura-ejemplo.pdf'));
  await p.evaluate(() => { window.print = () => {}; });
  await p.click('#btn-imprimir');
  await p.waitForTimeout(300);
  await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: path.join(CAPTURAS, 'factura-impresa.png'), fullPage: true });
  await ctx.close();

  // Ordenador, modo oscuro
  const os = await contexto(browser, { viewport: { width: 1440, height: 1000 } }, true);
  await os.p.screenshot({ path: path.join(CAPTURAS, 'modo-oscuro.png') });
  await os.ctx.close();

  // Móvil
  const m = await contexto(browser, devices['Pixel 7']);
  await m.p.screenshot({ path: path.join(CAPTURAS, 'movil-1-inicio.png') });
  await ir(m.p, 'facturas');
  await m.p.evaluate(() => document.querySelector('#c-lista').scrollIntoView());
  await m.p.screenshot({ path: path.join(CAPTURAS, 'movil-4-facturas.png') });
  await m.p.click('#c-lista .item-factura:has-text("A 15/26") [data-abrir]');
  await m.p.waitForTimeout(300);
  await m.p.screenshot({ path: path.join(CAPTURAS, 'movil-2-nueva-factura.png') });
  await m.p.click('#seg-editor [data-modo=previa]');
  await m.p.waitForTimeout(300);
  await m.p.screenshot({ path: path.join(CAPTURAS, 'movil-3-ver-factura.png') });
  await m.p.click('#btn-pdf-movil');
  await m.p.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
  await m.p.screenshot({ path: path.join(CAPTURAS, 'movil-5-pdf.png') });
  await m.ctx.close();
  const mo = await contexto(browser, devices['Pixel 7'], true);
  await mo.p.screenshot({ path: path.join(CAPTURAS, 'movil-6-oscuro.png') });
  await mo.ctx.close();

  await browser.close();
  for (const f of fs.readdirSync(CAPTURAS)) if (f.startsWith('movil-')) reducir(path.join(CAPTURAS, f));
  console.log('Capturas:', fs.readdirSync(CAPTURAS).join(', '));
})();
