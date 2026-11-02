/*
 * Prueba de punta a punta del programa de facturación.
 *
 *   node pruebas/prueba-completa.cjs [carpeta-de-salida]
 *
 * Abre index.html en Chromium (Playwright), da de alta dos empresas, hace varias
 * facturas, comprueba la numeración por empresa, los importes, la pestaña de
 * Contabilidad (cobrado / no cobrado), el PDF, el CSV y la copia de seguridad.
 * Deja capturas y un PDF de ejemplo en la carpeta de salida (por defecto: pruebas/salida).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const URL_APP = 'file://' + path.join(RAIZ, 'index.html');
const SALIDA = path.resolve(process.argv[2] || path.join(__dirname, 'salida'));
fs.mkdirSync(SALIDA, { recursive: true });

let fallos = 0;
function comprobar(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.log('  ✘ ' + msg); fallos++; }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, locale: 'es-ES' });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  const dialogos = [];
  page.on('dialog', async (d) => { dialogos.push(d.message()); await d.accept(); });

  // Logo de prueba generado al vuelo
  const logoPng = await (async () => {
    const p = await context.newPage();
    const dataUrl = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 480; c.height = 160;
      const x = c.getContext('2d');
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(80, 80, 60, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#222'; x.font = 'bold 54px Arial'; x.fillText('FRAN', 160, 100);
      return c.toDataURL('image/png');
    });
    await p.close();
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  })();

  await page.goto(URL_APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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
  // Dibujar la firma con el ratón
  await page.click('#e-firma-dibujar');
  const caja = await page.locator('#firma-lienzo').boundingBox();
  await page.mouse.move(caja.x + 60, caja.y + 150);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    await page.mouse.move(caja.x + 60 + i * 12, caja.y + 150 + Math.sin(i / 3) * 45);
  }
  await page.mouse.up();
  await page.click('#firma-usar');
  await page.waitForSelector('#e-firma-caja img');
  await page.fill('#e-inicio', '4'); // Fran va por la 4.ª factura
  await page.selectOption('#e-digitos', '3');
  await page.fill('#e-iban', 'ES91 2100 0418 4502 0005 1332');
  await page.click('#form-empresa button[type=submit]');
  comprobar((await page.textContent('#emp-lista')).includes('próxima: 004'), 'empresa 1: la próxima factura es la 004');

  await page.click('#emp-nueva');
  await page.fill('#e-nombre', 'Reformas Integrales Norte, S.L.');
  await page.fill('#e-cif', 'B87654321');
  await page.fill('#e-dir', 'Av. de la Constitución, 3');
  await page.fill('#e-cp', '41001');
  await page.fill('#e-pob', 'Sevilla');
  await page.fill('#e-prov', 'Sevilla');
  await page.fill('#e-color', '#2e7d32');
  await page.fill('#e-serie', 'R-');
  await page.selectOption('#e-digitos', '4');
  await page.click('#form-empresa button[type=submit]');
  comprobar((await page.textContent('#emp-lista')).includes('próxima: R-0001'), 'empresa 2: numeración propia R-0001');
  await page.screenshot({ path: path.join(SALIDA, '3-empresas.png'), fullPage: false });

  console.log('3. Facturas');
  async function hacerFactura({ empresa, cliente, concepto, base, iva = true, pct, motivo }) {
    await page.click('nav button[data-vista=factura]');
    if (await page.isVisible('#btn-borrar-factura')) await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: empresa });
    if (cliente.guardado) await page.selectOption('#f-cliente', { label: cliente.guardado });
    else {
      await page.selectOption('#f-cliente', '');
      await page.fill('#f-cli-nombre', cliente.nombre);
      await page.fill('#f-cli-cif', cliente.cif);
      await page.fill('#f-cli-dir', cliente.dir);
      await page.fill('#f-cli-cp', cliente.cp);
      await page.fill('#f-cli-pob', cliente.pob);
      await page.fill('#f-cli-prov', cliente.prov);
    }
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
    await page.waitForTimeout(100);
    return (await page.textContent('#titulo-editor')).trim();
  }

  const t1 = await hacerFactura({
    empresa: 'Construcciones Fran, S.L.',
    cliente: { nombre: 'Comunidad de Propietarios Calle Sol 8', cif: 'h28123456', dir: 'Calle Sol, 8', cp: '28004', pob: 'Madrid', prov: 'Madrid' },
    concepto: 'Reparación de la fachada principal:\n- Picado y enfoscado de 45 m² de paramento.\n- Pintura con revestimiento elástico.\n- Montaje y desmontaje de andamio.',
    base: '1.000',
  });
  comprobar(t1.startsWith('Factura 004'), 'primera factura de la empresa 1 → 004 (' + t1 + ')');
  comprobar((await page.textContent('#r-total')).includes('1.210,00'), 'base 1.000 € + IVA 21 % = 1.210,00 € (' + (await page.textContent('#r-total')) + ')');
  await page.screenshot({ path: path.join(SALIDA, '1-nueva-factura.png'), fullPage: false });

  const t2 = await hacerFactura({
    empresa: 'Construcciones Fran, S.L.',
    cliente: { guardado: 'Comunidad de Propietarios Calle Sol 8 · H28123456' },
    concepto: 'Sustitución de bajantes en patio interior.', base: '2.345,67', pct: 10,
  });
  comprobar(t2.startsWith('Factura 005'), 'segunda factura de la empresa 1 → 005 (' + t2 + ')');
  comprobar((await page.textContent('#r-total')).includes('2.580,24'), 'base 2.345,67 € + IVA 10 % = 2.580,24 € (' + (await page.textContent('#r-total')) + ')');

  const t3 = await hacerFactura({
    empresa: 'Reformas Integrales Norte, S.L.',
    cliente: { nombre: 'Construcciones Fran, S.L.', cif: 'B12345678', dir: 'Calle Mayor, 15', cp: '28013', pob: 'Madrid', prov: 'Madrid' },
    concepto: 'Subcontrata de alicatado de baños (obra calle Sol 8).', base: '800', iva: false,
    motivo: 'Inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992)',
  });
  comprobar(t3.startsWith('Factura R-0001'), 'la empresa 2 empieza su propia numeración → R-0001 (' + t3 + ')');
  comprobar((await page.textContent('#r-total')).includes('800,00'), 'sin IVA: total = base (' + (await page.textContent('#r-total')) + ')');
  comprobar((await page.textContent('#previa-factura')).includes('Inversión del sujeto pasivo'), 'el motivo de no llevar IVA sale en la factura');

  console.log('4. Número repetido');
  await page.click('#btn-nueva-factura');
  await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
  await page.fill('#f-numero', '4');
  await page.fill('#f-cli-nombre', 'Prueba');
  await page.fill('#f-concepto', 'x');
  await page.fill('#f-base', '10');
  await page.click('#form-factura button[type=submit]');
  await page.waitForTimeout(100);
  comprobar((await page.textContent('#toast')).includes('Ya existe la factura 004'), 'no deja repetir un número ya usado');
  comprobar((await page.textContent('#titulo-editor')).trim() === 'Nueva factura', 'la factura repetida no se ha guardado');
  await page.click('#btn-nueva-factura');

  console.log('5. Contabilidad');
  await page.click('nav button[data-vista=contabilidad]');
  const filas = await page.locator('#c-lista tr').count();
  comprobar(filas === 3, '3 facturas en Contabilidad (' + filas + ')');
  const tarjetas = await page.textContent('#c-tarjetas');
  comprobar(tarjetas.includes('4.590,24'), 'total facturado 1.210 + 2.580,24 + 800 = 4.590,24 €');
  comprobar(/Pendiente de cobro\s*4\.590,24/.test(tarjetas.replace(/\u00a0/g, ' ')), 'todo pendiente de cobro al principio');
  await page.click('#c-lista tr:has-text("004") button.estado');
  await page.waitForTimeout(100);
  const tarjetas2 = (await page.textContent('#c-tarjetas')).replace(/\u00a0/g, ' ');
  comprobar(/Cobrado\s*1\.210,00/.test(tarjetas2), 'marcar 004 como cobrada → cobrado 1.210,00 €');
  comprobar(/Pendiente de cobro\s*3\.380,24/.test(tarjetas2), 'pendiente baja a 3.380,24 €');
  await page.selectOption('#c-estado', 'pendientes');
  comprobar((await page.locator('#c-lista tr').count()) === 2, 'filtro «No cobradas» muestra 2');
  await page.selectOption('#c-estado', '');
  await page.screenshot({ path: path.join(SALIDA, '2-contabilidad.png'), fullPage: false });

  console.log('6. CSV para el gestor');
  const [descargaCsv] = await Promise.all([page.waitForEvent('download'), page.click('#c-csv')]);
  const csv = fs.readFileSync(await descargaCsv.path(), 'utf8');
  fs.writeFileSync(path.join(SALIDA, 'facturas.csv'), csv);
  comprobar(csv.split('\r\n').length === 4 && csv.includes('2345,67') && csv.includes('Cobrada'), 'CSV con cabecera + 3 facturas, decimales con coma');

  console.log('7. PDF / impresión');
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#c-lista tr:has-text("004") button[data-imprimir]');
  await page.waitForTimeout(300);
  const pdf = path.join(SALIDA, 'factura-004.pdf');
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const paginas = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  comprobar(paginas === 1, 'la factura cabe en 1 página A4 (' + paginas + ')');
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: path.join(SALIDA, '4-factura-impresa.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  console.log('8. Persistencia y copia de seguridad');
  await page.reload();
  await page.click('nav button[data-vista=contabilidad]');
  comprobar((await page.locator('#c-lista tr').count()) === 3, 'los datos siguen tras recargar');
  comprobar(await page.isVisible('#aviso-copia'), 'avisa de que no hay copia de seguridad');
  await page.click('nav button[data-vista=copias]');
  const [descargaCopia] = await Promise.all([page.waitForEvent('download'), page.click('#cp-descargar')]);
  const copia = path.join(SALIDA, 'copia.json');
  fs.copyFileSync(await descargaCopia.path(), copia);
  comprobar(!(await page.isVisible('#aviso-copia')), 'el aviso desaparece tras descargar la copia');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  comprobar(await page.isVisible('#sin-empresas'), 'tras borrar el navegador no queda nada');
  await page.click('nav button[data-vista=copias]');
  await page.setInputFiles('#cp-archivo', copia);
  await page.waitForTimeout(200);
  await page.click('nav button[data-vista=contabilidad]');
  comprobar((await page.locator('#c-lista tr').count()) === 3, 'la copia restaura las 3 facturas');
  comprobar((await page.textContent('#c-lista')).includes('Cobrada'), 'y conserva el estado de cobro');

  console.log('9. Siguiente número tras restaurar');
  await page.click('nav button[data-vista=factura]');
  await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
  comprobar((await page.textContent('#f-numero-ayuda')).includes('006'), 'la siguiente factura de la empresa 1 es la 006');

  console.log('10. Vista móvil');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth);
  comprobar(anchoDoc <= 392, 'sin scroll horizontal en móvil (' + anchoDoc + 'px)');
  await page.screenshot({ path: path.join(SALIDA, '5-movil.png'), fullPage: false });

  console.log('\nDiálogos mostrados durante la prueba:');
  dialogos.forEach((d) => console.log('  · ' + d.split('\n')[0]));
  comprobar(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) FALLIDA(S)` : '\nTodo correcto ✔');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
