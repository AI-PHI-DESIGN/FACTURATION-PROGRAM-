/*
 * Prueba de punta a punta del programa de facturación (app web instalable).
 *
 *   node pruebas/prueba-completa.cjs [carpeta-de-salida]
 *
 * Levanta un servidor local, abre la app en Chromium (Playwright) y hace lo mismo que haría Fran:
 *   · Ordenador: alta de empresas, facturas con numeración POR CLIENTE (y una empresa con numeración
 *     única), importes e IVA, número repetido, Contabilidad (cobrado / no cobrado), CSV, impresión,
 *     PDF, copia de seguridad.
 *   · Móvil (Pixel 7): app instalable (manifest + service worker), funciona SIN INTERNET, menú abajo,
 *     contabilidad en tarjetas, PDF desde el móvil, sin scroll horizontal.
 * Deja capturas, PDFs y un CSV en la carpeta de salida (por defecto: pruebas/salida).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const SALIDA = path.resolve(process.argv[2] || path.join(__dirname, 'salida'));
const PUERTO = 8765 + Math.floor(Math.random() * 1000);
const URL_APP = `http://127.0.0.1:${PUERTO}/`;
fs.mkdirSync(SALIDA, { recursive: true });

let fallos = 0;
function comprobar(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.log('  ✘ ' + msg); fallos++; }
}
const sinEspacios = (s) => String(s).replace(/[  ]/g, ' ');
function paginasPDF(ruta) {
  try { return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [ruta]).toString())[1]); }
  catch (e) { return (fs.readFileSync(ruta, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; }
}
function esperarServidor() {
  return new Promise((ok, mal) => {
    let intentos = 0;
    const probar = () => http.get(URL_APP, (r) => { r.resume(); ok(); }).on('error', () => {
      if (++intentos > 50) mal(new Error('el servidor no arranca')); else setTimeout(probar, 100);
    });
    probar();
  });
}
function vigilarErrores(page, errores) {
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('dialog', async (d) => { console.log('    · diálogo: ' + d.message().split('\n')[0]); await d.accept(); });
}

(async () => {
  const servidor = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1', '--directory', RAIZ], { stdio: 'ignore' });
  await esperarServidor();
  const browser = await chromium.launch();
  const errores = [];

  try {
    /* =================== ORDENADOR =================== */
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, locale: 'es-ES' });
    const page = await ctx.newPage();
    vigilarErrores(page, errores);

    const logoPng = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 480; c.height = 160;
      const x = c.getContext('2d');
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(80, 80, 60, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#222'; x.font = 'bold 54px Arial'; x.fillText('FRAN', 160, 100);
      return c.toDataURL('image/png').split(',')[1];
    }), 'base64');

    await page.goto(URL_APP);

    console.log('1. Primer arranque');
    comprobar(await page.isVisible('#sin-empresas'), 'muestra la bienvenida si no hay empresas');

    console.log('2. Alta de empresas');
    await page.click('#btn-ir-empresas');
    await page.fill('#e-nombre', 'Construcciones Fran, S.L.');
    await page.fill('#e-cif', 'b12345678');
    await page.fill('#e-tel', '600 123 456');
    await page.fill('#e-dir', 'Calle Mayor, 15, 2.º B');
    await page.fill('#e-cp', '28013');
    await page.fill('#e-pob', 'Madrid');
    await page.fill('#e-prov', 'Madrid');
    await page.fill('#e-email', 'fran@ejemplo.es');
    await page.fill('#e-firmante', 'Francisco Pérez');
    await page.fill('#e-pie', 'Inscrita en el Registro Mercantil de Madrid, Tomo 0000, Folio 00, Hoja M-000000.');
    await page.setInputFiles('#e-logo-archivo', { name: 'logo.png', mimeType: 'image/png', buffer: logoPng });
    await page.waitForSelector('#e-logo-caja img');
    await page.click('#e-firma-dibujar');
    const caja = await page.locator('#firma-lienzo').boundingBox();
    await page.mouse.move(caja.x + 60, caja.y + 150);
    await page.mouse.down();
    for (let i = 0; i <= 40; i++) await page.mouse.move(caja.x + 60 + i * 12, caja.y + 150 + Math.sin(i / 3) * 45);
    await page.mouse.up();
    await page.click('#firma-usar');
    await page.waitForSelector('#e-firma-caja img');
    comprobar(await page.inputValue('#e-modo') === 'cliente', 'por defecto, cada cliente lleva su propia numeración');
    await page.selectOption('#e-digitos', '3');
    await page.fill('#e-iban', 'ES91 2100 0418 4502 0005 1332');
    await page.click('#form-empresa button[type=submit]');
    comprobar((await page.textContent('#emp-lista')).includes('numeración por cliente'), 'empresa 1 guardada con numeración por cliente');

    await page.click('#emp-nueva');
    await page.fill('#e-nombre', 'Reformas Integrales Norte, S.L.');
    await page.fill('#e-cif', 'B87654321');
    await page.fill('#e-dir', 'Av. de la Constitución, 3');
    await page.fill('#e-cp', '41001');
    await page.fill('#e-pob', 'Sevilla');
    await page.fill('#e-prov', 'Sevilla');
    await page.fill('#e-color', '#2e7d32');
    await page.selectOption('#e-modo', 'empresa');
    await page.fill('#e-serie', 'R-');
    await page.selectOption('#e-digitos', '4');
    await page.click('#form-empresa button[type=submit]');
    comprobar((await page.textContent('#emp-lista')).includes('próxima: R-0001'), 'empresa 2: numeración única de empresa R-0001');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-3-empresas.png') });

    console.log('3. Facturas con numeración por cliente');
    async function hacerFactura({ empresa, cliente, concepto, base, iva = true, pct, motivo, numero }) {
      await page.click('nav button[data-vista=factura]');
      if (await page.isVisible('#btn-borrar-factura')) await page.click('#btn-nueva-factura');
      await page.selectOption('#f-empresa', { label: empresa });
      if (cliente.guardado) await page.selectOption('#f-cliente', { label: cliente.guardado });
      else {
        await page.selectOption('#f-cliente', '');
        await page.fill('#f-cli-nombre', cliente.nombre);
        await page.fill('#f-cli-cif', cliente.cif);
        await page.locator('#f-cli-cif').blur();
        if (cliente.codigo) await page.fill('#f-cli-codigo', cliente.codigo);
        await page.fill('#f-cli-dir', cliente.dir);
        await page.fill('#f-cli-cp', cliente.cp);
        await page.fill('#f-cli-pob', cliente.pob);
        await page.fill('#f-cli-prov', cliente.prov);
      }
      if (numero) await page.fill('#f-numero', String(numero));
      await page.fill('#f-concepto', concepto);
      await page.fill('#f-base', base);
      await page.locator('#f-base').blur();
      if (!iva) {
        await page.uncheck('#f-aplica-iva');
        if (motivo) await page.fill('#f-exencion', motivo);
      } else if (pct != null) {
        await page.fill('#f-iva', String(pct));
      }
      await page.click('#form-factura button[type=submit]');
      await page.waitForTimeout(150);
      return (await page.textContent('#titulo-editor')).trim();
    }
    const SOL = { nombre: 'Comunidad de Propietarios Calle Sol 8', cif: 'h28123456', dir: 'Calle Sol, 8', cp: '28004', pob: 'Madrid', prov: 'Madrid' };

    // Primera factura a este cliente: Fran ya le había hecho 3 → pone el 4 a mano
    await page.click('nav button[data-vista=factura]');
    await page.fill('#f-cli-nombre', SOL.nombre);
    comprobar(await page.inputValue('#f-cli-codigo') === 'CPCS', 'el código del cliente se propone solo (CPCS)');
    const t1 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.', cliente: SOL, numero: 4,
      concepto: 'Reparación de la fachada principal:\n- Picado y enfoscado de 45 m² de paramento.\n- Pintura con revestimiento elástico.\n- Montaje y desmontaje de andamio.',
      base: '1.000',
    });
    comprobar(t1.startsWith('Factura CPCS-004'), 'primera factura a este cliente con el nº que toca → CPCS-004 (' + t1 + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('1.210,00'), 'base 1.000 € + IVA 21 % = 1.210,00 €');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-1-nueva-factura.png') });

    const t2 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.', cliente: { guardado: 'Comunidad de Propietarios Calle Sol 8 · H28123456' },
      concepto: 'Sustitución de bajantes en patio interior.', base: '2.345,67', pct: 10,
    });
    comprobar(t2.startsWith('Factura CPCS-005'), 'siguiente factura al mismo cliente → CPCS-005 (' + t2 + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('2.580,24'), 'base 2.345,67 € + IVA 10 % = 2.580,24 €');

    const t3 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.',
      cliente: { nombre: 'Ayuntamiento de Getafe', cif: 'P2806500A', dir: 'Plaza de la Constitución, 1', cp: '28901', pob: 'Getafe', prov: 'Madrid' },
      concepto: 'Reparación de aceras en la calle Madrid.', base: '500',
    });
    comprobar(t3.startsWith('Factura AG-001'), 'otro cliente empieza su propia numeración → AG-001 (' + t3 + ')');

    const t4 = await hacerFactura({
      empresa: 'Reformas Integrales Norte, S.L.',
      cliente: { nombre: 'Construcciones Fran, S.L.', cif: 'B12345678', dir: 'Calle Mayor, 15', cp: '28013', pob: 'Madrid', prov: 'Madrid' },
      concepto: 'Subcontrata de alicatado de baños (obra calle Sol 8).', base: '800', iva: false,
      motivo: 'Inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992)',
    });
    comprobar(t4.startsWith('Factura R-0001'), 'empresa con numeración única → R-0001 (' + t4 + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('800,00'), 'sin IVA: total = base');
    comprobar((await page.textContent('#previa-factura')).includes('Inversión del sujeto pasivo'), 'el motivo de no llevar IVA sale en la factura');

    console.log('4. Controles de numeración');
    await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.selectOption('#f-cliente', { label: 'Comunidad de Propietarios Calle Sol 8 · H28123456' });
    comprobar((await page.textContent('#f-numero-ayuda')).includes('CPCS-006'), 'al elegir el cliente propone su siguiente número (CPCS-006)');
    await page.fill('#f-numero', '4');
    await page.fill('#f-concepto', 'x');
    await page.fill('#f-base', '10');
    await page.click('#form-factura button[type=submit]');
    await page.waitForTimeout(100);
    comprobar((await page.textContent('#toast')).includes('Ya existe la factura CPCS-004'), 'no deja repetir un número de ese cliente');
    await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.fill('#f-cli-cif', 'P2806500A');
    await page.locator('#f-cli-cif').blur();
    await page.waitForTimeout(100);
    comprobar(await page.inputValue('#f-cli-nombre') === 'Ayuntamiento de Getafe', 'al escribir el CIF de un cliente guardado, se elige ese cliente');
    comprobar((await page.textContent('#f-numero-ayuda')).includes('AG-002'), '…y su siguiente número (AG-002)');
    await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.fill('#f-cli-nombre', 'Otro cliente');
    await page.fill('#f-cli-codigo', 'AG');
    await page.fill('#f-concepto', 'x');
    await page.fill('#f-base', '10');
    await page.click('#form-factura button[type=submit]');
    await page.waitForTimeout(100);
    comprobar((await page.textContent('#toast')).includes('ya es del cliente Ayuntamiento de Getafe'), 'no deja usar el código de otro cliente');
    await page.click('#btn-nueva-factura');

    console.log('5. Contabilidad');
    await page.click('nav button[data-vista=contabilidad]');
    comprobar((await page.locator('#c-lista tr').count()) === 4, '4 facturas en Contabilidad');
    let tarjetas = sinEspacios(await page.textContent('#c-tarjetas'));
    comprobar(tarjetas.includes('5.195,24'), 'total facturado 1.210 + 2.580,24 + 605 + 800 = 5.195,24 €');
    comprobar(/Pendiente de cobro\s*5\.195,24/.test(tarjetas), 'todo pendiente de cobro al principio');
    await page.click('#c-lista tr:has-text("CPCS-004") button.estado');
    await page.waitForTimeout(100);
    tarjetas = sinEspacios(await page.textContent('#c-tarjetas'));
    comprobar(/Cobrado\s*1\.210,00/.test(tarjetas), 'marcar CPCS-004 como cobrada → cobrado 1.210,00 €');
    comprobar(/Pendiente de cobro\s*3\.985,24/.test(tarjetas), 'pendiente baja a 3.985,24 €');
    await page.selectOption('#c-estado', 'pendientes');
    comprobar((await page.locator('#c-lista tr').count()) === 3, 'filtro «No cobradas» muestra 3');
    await page.selectOption('#c-estado', '');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-2-contabilidad.png') });

    console.log('6. CSV para el gestor');
    const [descargaCsv] = await Promise.all([page.waitForEvent('download'), page.click('#c-csv')]);
    const csv = fs.readFileSync(await descargaCsv.path(), 'utf8');
    fs.writeFileSync(path.join(SALIDA, 'facturas.csv'), csv);
    comprobar(csv.split('\r\n').length === 5 && csv.includes('2345,67') && csv.includes('CPCS-004'), 'CSV con cabecera + 4 facturas, decimales con coma');

    console.log('7. PDF para enviar');
    await page.click('#c-lista tr:has-text("CPCS-004") button[data-pdf]');
    await page.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
    const [descargaPdf] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-descargar')]);
    const pdfApp = path.join(SALIDA, 'factura-CPCS-004.pdf');
    fs.copyFileSync(await descargaPdf.path(), pdfApp);
    comprobar(descargaPdf.suggestedFilename() === 'Factura CPCS-004 - Comunidad de Propietarios Calle Sol 8.pdf', 'nombre del PDF: ' + descargaPdf.suggestedFilename());
    comprobar(fs.readFileSync(pdfApp).subarray(0, 4).toString() === '%PDF' && paginasPDF(pdfApp) === 1, 'PDF válido de 1 página (' + Math.round(fs.statSync(pdfApp).size / 1024) + ' KB)');

    console.log('8. Impresión');
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#c-lista tr:has-text("CPCS-004") button[data-imprimir]');
    await page.waitForTimeout(300);
    const pdfImpresion = path.join(SALIDA, 'impresion-CPCS-004.pdf');
    await page.pdf({ path: pdfImpresion, preferCSSPageSize: true, printBackground: true });
    comprobar(paginasPDF(pdfImpresion) === 1, 'la factura impresa cabe en 1 página A4');
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: path.join(SALIDA, 'factura-impresa.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });

    console.log('9. Persistencia y copia de seguridad');
    await page.reload();
    await page.click('nav button[data-vista=contabilidad]');
    comprobar((await page.locator('#c-lista tr').count()) === 4, 'los datos siguen tras recargar');
    comprobar(await page.isVisible('#aviso-copia'), 'avisa de que no hay copia de seguridad');
    await page.click('nav button[data-vista=copias]');
    const [descargaCopia] = await Promise.all([page.waitForEvent('download'), page.click('#cp-descargar')]);
    const copia = path.join(SALIDA, 'copia.json');
    fs.copyFileSync(await descargaCopia.path(), copia);
    comprobar(!(await page.isVisible('#aviso-copia')), 'el aviso desaparece tras descargar la copia');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    comprobar(await page.isVisible('#sin-empresas'), 'tras borrar los datos no queda nada');
    await page.click('nav button[data-vista=copias]');
    await page.setInputFiles('#cp-archivo', copia);
    await page.waitForTimeout(200);
    await page.click('nav button[data-vista=contabilidad]');
    comprobar((await page.locator('#c-lista tr').count()) === 4, 'la copia restaura las 4 facturas');
    await page.click('nav button[data-vista=factura]');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.selectOption('#f-cliente', { label: 'Comunidad de Propietarios Calle Sol 8 · H28123456' });
    comprobar((await page.textContent('#f-numero-ayuda')).includes('CPCS-006'), 'tras restaurar, la numeración por cliente sigue (CPCS-006)');
    await ctx.close();

    /* =================== MÓVIL =================== */
    console.log('10. Móvil: app instalable y sin internet');
    const movil = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true, locale: 'es-ES' });
    const m = await movil.newPage();
    vigilarErrores(m, errores);
    await m.goto(URL_APP);
    await m.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const cdp = await movil.newCDPSession(m);
    const instalable = await cdp.send('Page.getInstallabilityErrors');
    comprobar(instalable.installabilityErrors.length === 0, 'Chrome la considera instalable como app' + (instalable.installabilityErrors.length ? ': ' + JSON.stringify(instalable.installabilityErrors) : ''));
    const manifiesto = await cdp.send('Page.getAppManifest');
    comprobar(!manifiesto.errors.length, 'manifest.json sin errores');
    await m.reload();
    await m.waitForFunction(() => !!navigator.serviceWorker.controller);
    await movil.setOffline(true);
    await m.reload();
    comprobar(await m.isVisible('#sin-empresas'), 'SIN INTERNET la app se abre igual');
    await m.click('nav button[data-vista=copias]');
    await m.setInputFiles('#cp-archivo', copia);
    await m.waitForTimeout(200);

    console.log('11. Móvil: diseño');
    const nav = await m.locator('.barra nav').boundingBox();
    const alto = m.viewportSize().height;
    comprobar(Math.abs(nav.y + nav.height - alto) <= 1, 'el menú está abajo, como en una app');
    await m.click('nav button[data-vista=factura]');
    await m.waitForTimeout(200);
    await m.screenshot({ path: path.join(SALIDA, 'movil-1-nueva-factura.png') });
    await m.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await m.selectOption('#f-cliente', { label: 'Comunidad de Propietarios Calle Sol 8 · H28123456' });
    await m.fill('#f-concepto', 'Revisión de la cubierta y sustitución de 12 tejas rotas.');
    await m.fill('#f-base', '350');
    await m.locator('#f-base').blur();
    await m.click('#form-factura button[type=submit]');
    await m.waitForTimeout(150);
    comprobar((await m.textContent('#titulo-editor')).includes('CPCS-006'), 'factura hecha desde el móvil y sin internet → CPCS-006');
    await m.screenshot({ path: path.join(SALIDA, 'movil-2-factura-guardada.png'), fullPage: true });
    await m.click('#btn-pdf');
    await m.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
    comprobar((await m.textContent('#pdf-texto')).includes('PDF listo'), 'el PDF se crea en el móvil sin internet');
    await m.screenshot({ path: path.join(SALIDA, 'movil-4-pdf.png') });
    const [descargaMovil] = await Promise.all([m.waitForEvent('download'), m.click('#pdf-descargar')]);
    const pdfMovil = path.join(SALIDA, 'factura-CPCS-006-movil.pdf');
    fs.copyFileSync(await descargaMovil.path(), pdfMovil);
    comprobar(paginasPDF(pdfMovil) === 1, 'PDF del móvil de 1 página');
    await m.click('nav button[data-vista=contabilidad]');
    await m.waitForTimeout(200);
    const display = await m.locator('#c-lista tr').first().evaluate((el) => getComputedStyle(el).display);
    comprobar(display === 'grid', 'en el móvil las facturas se ven como tarjetas');
    await m.click('#c-lista tr:has-text("CPCS-006") button.estado');
    await m.waitForTimeout(100);
    comprobar((await m.textContent('#c-lista tr:has-text("CPCS-006")')).includes('Cobrada'), 'se marca como cobrada con un toque');
    await m.screenshot({ path: path.join(SALIDA, 'movil-3-contabilidad.png') });
    for (const vista of ['factura', 'contabilidad', 'clientes', 'empresas', 'copias']) {
      await m.click(`nav button[data-vista=${vista}]`);
      await m.waitForTimeout(100);
      const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
      comprobar(ancho <= m.viewportSize().width + 1, `sin scroll horizontal en «${vista}» (${ancho}px)`);
    }
    await movil.setOffline(false);
    await movil.close();

    console.log('12. Abrir con doble clic (file://) sigue funcionando');
    const local = await browser.newContext();
    const l = await local.newPage();
    const erroresLocal = [];
    l.on('pageerror', (e) => erroresLocal.push(e.message));
    await l.goto('file://' + path.join(RAIZ, 'index.html'));
    comprobar(await l.isVisible('#sin-empresas') && erroresLocal.length === 0, 'abre desde el archivo sin errores');
    await local.close();
  } finally {
    await browser.close();
    servidor.kill();
  }

  comprobar(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  console.log(fallos ? `\n${fallos} comprobación(es) FALLIDA(S)` : '\nTodo correcto ✔');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
