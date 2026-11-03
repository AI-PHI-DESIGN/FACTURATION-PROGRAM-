/*
 * Prueba de punta a punta del programa de facturación (app web instalable).
 *
 *   node pruebas/prueba-completa.cjs [carpeta-de-salida]
 *
 * Levanta un servidor local, abre la app en Chromium (Playwright) y hace lo mismo que haría Fran:
 *   · Ordenador: alta de empresas, facturas con numeración POR CLIENTE (y una empresa con numeración
 *     única), vencimientos, IRPF, sin IVA, números repetidos, Facturas (cobrada / pendiente / vencida,
 *     «Deshacer»), panel de Inicio con gráfico, recordatorio por WhatsApp, CSV, PDF, impresión,
 *     copia de seguridad, botón «atrás» y modo oscuro.
 *   · Móvil (Pixel 7): instalable (manifest + service worker), SIN INTERNET, menú abajo con botón +,
 *     barra de acciones del editor, «Ver factura», PDF, tarjetas, ficha de cliente, sin scroll horizontal.
 *   · Cuentas (con los emuladores de Firebase): usuario y contraseña, dos dispositivos, tiempo real, sin internet,
 *     pasar datos antiguos a la cuenta, reglas de seguridad, cerrar sesión y cambiar la contraseña.
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
const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Reloj fijo en el navegador: la numeración «A 15/26» depende del año, así la prueba da lo mismo cualquier día.
const HOY = new Date('2026-11-02T10:00:00');
const hace = (dias) => isoLocal(new Date(HOY.getTime() - dias * 864e5));
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
/* ---- Cuentas en la nube: emuladores de Firebase (herramientas/emuladores-firebase.sh) ---- */
const PROYECTO = 'demo-facturacion';
const AUTH_EMU = 'http://127.0.0.1:9099';
const FS_EMU = 'http://127.0.0.1:8080';
const CONFIG_NUBE_PRUEBA = { firebase: { apiKey: 'demo-clave', authDomain: `${PROYECTO}.firebaseapp.com`, projectId: PROYECTO, appId: 'demo' }, emulador: true, permitirRegistro: true };
const responde = (url) => new Promise((ok) => http.get(url, (r) => { r.resume(); ok(true); }).on('error', () => ok(false)));
async function emuladoresListos() {
  if (await responde(AUTH_EMU) && await responde(FS_EMU)) return true;
  console.log('    · arrancando los emuladores de Firebase (la primera vez tarda)…');
  const emu = spawn(path.join(RAIZ, 'herramientas', 'emuladores-firebase.sh'), [], { stdio: 'ignore', detached: true });
  emu.unref();
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await responde(AUTH_EMU) && await responde(FS_EMU)) return true;
  }
  return false;
}
/** Documentos de una colección leídos «como administrador» (el emulador acepta «Bearer owner»). */
async function docsNube(uid, col) {
  const r = await fetch(`${FS_EMU}/v1/projects/${PROYECTO}/databases/(default)/documents/usuarios/${uid}/${col}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const j = await r.json();
  return (j.documents || []).map((d) => d.fields);
}
async function esperarNube(cond, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); }
  return false;
}
async function uidDe(page) {
  const h = await page.waitForFunction(() => Object.keys(localStorage).find((k) => k.startsWith('facturacion.datos.u.')), null, { timeout: 20000 });
  return (await h.jsonValue()).slice('facturacion.datos.u.'.length);
}

function vigilarErrores(page, errores, nube = false) {
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // En la prueba de cuentas, las contraseñas incorrectas y el modo sin internet fallan a propósito.
    const url = (m.location() && m.location().url) || '';
    if (nube && m.text().startsWith('Failed to load resource') && (url.startsWith(AUTH_EMU) || url.startsWith(FS_EMU) || m.text().includes('ERR_INTERNET_DISCONNECTED'))) return;
    if (nube && m.text().includes('Could not reach Cloud Firestore backend')) return;
    errores.push(m.text() + (url ? ` [${url}]` : ''));
  });
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
    // El aviso «Instalar» sale cuando Chrome decide; en el ordenador lo damos por cerrado para que no mueva nada.
    await ctx.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
    await ctx.clock.setFixedTime(HOY);
    const page = await ctx.newPage();
    vigilarErrores(page, errores);
    const ir = async (vista) => { await page.click(`.nav-item[data-ir=${vista}]`); await page.waitForTimeout(120); };
    const textoToast = async () => sinEspacios(await page.textContent('#toast'));

    const logoPng = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 480; c.height = 160;
      const x = c.getContext('2d');
      x.fillStyle = '#c0392b'; x.beginPath(); x.arc(80, 80, 60, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#222'; x.font = 'bold 54px Arial'; x.fillText('FRAN', 160, 100);
      return c.toDataURL('image/png').split(',')[1];
    }), 'base64');

    await page.goto(URL_APP);

    console.log('1. Primer arranque');
    comprobar(await page.isVisible('#ini-vacio'), 'Inicio muestra los primeros pasos si no hay nada');

    console.log('2. Alta de empresas');
    await page.click('#btn-paso-empresa');
    comprobar(await page.isVisible('#vista-empresa'), '«Empezar» abre la ficha de empresa');
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
    comprobar(await page.inputValue('#e-plantilla') === 'clasica' && await page.inputValue('#e-formato') === 'anual', 'por defecto: plantilla clásica y número «A 15/26»');
    await page.fill('#e-cargo', 'Arquitecto');
    await page.fill('#e-nota', 'Factura acogida al criterio de Caja del IVA');
    comprobar(await page.inputValue('#e-plazo') === '30', 'plazo de pago por defecto: 30 días');
    comprobar(!(await page.isVisible('#e-digitos')), 'con el formato «A 15/26» no se piden cifras');
    await page.fill('#e-iban', 'ES91 2100 0418 4502 0005 1332');
    await page.click('#form-empresa button[type=submit]');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-4-empresa.png') });
    await page.click('#emp-volver');
    comprobar((await page.textContent('#aj-empresas')).includes('numeración por cliente'), 'empresa 1 guardada con numeración por cliente');

    await page.click('#aj-nueva-empresa');
    await page.fill('#e-nombre', 'Reformas Integrales Norte, S.L.');
    await page.fill('#e-cif', 'B87654321');
    await page.fill('#e-dir', 'Av. de la Constitución, 3');
    await page.fill('#e-cp', '41001');
    await page.fill('#e-pob', 'Sevilla');
    await page.fill('#e-prov', 'Sevilla');
    await page.fill('#e-color', '#2e7d32');
    await page.selectOption('#e-plantilla', 'moderna');
    await page.selectOption('#e-formato', 'guion');
    await page.selectOption('#e-modo', 'empresa');
    await page.fill('#e-serie', 'R-');
    await page.selectOption('#e-digitos', '4');
    await page.click('#form-empresa button[type=submit]');
    await page.click('#emp-volver');
    comprobar((await page.textContent('#aj-empresas')).includes('próxima: R-0001'), 'empresa 2: numeración única de empresa R-0001');

    console.log('3. Facturas');
    async function hacerFactura({ empresa, cliente, concepto, base, iva = true, pct, motivo, numero, fecha, irpf }) {
      await page.click('.nav-nueva');
      await page.waitForTimeout(100);
      if (await page.isVisible('#btn-borrar-factura')) await page.click('#btn-nueva-factura');
      await page.selectOption('#f-empresa', { label: empresa });
      if (cliente.guardado) await page.selectOption('#f-cliente', { label: cliente.guardado });
      else {
        await page.selectOption('#f-cliente', '');
        await page.fill('#f-cli-nombre', cliente.nombre);
        await page.fill('#f-cli-cif', cliente.cif);
        await page.locator('#f-cli-cif').blur();
        await page.fill('#f-cli-dir', cliente.dir);
        await page.fill('#f-cli-cp', cliente.cp);
        await page.fill('#f-cli-pob', cliente.pob);
        await page.fill('#f-cli-prov', cliente.prov);
        if (cliente.tel) await page.fill('#f-cli-tel', cliente.tel);
      }
      if (fecha) { await page.fill('#f-fecha', fecha); await page.locator('#f-fecha').dispatchEvent('change'); }
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
      if (irpf) { await page.check('#f-aplica-irpf'); await page.fill('#f-irpf', String(irpf)); }
      await page.click('#form-factura button[type=submit]');
      await page.waitForTimeout(150);
      return (await page.textContent('#titulo-editor')).trim();
    }
    const SOL = { nombre: 'Comunidad de Propietarios Calle Sol 8', cif: 'h28123456', dir: 'Calle Sol, 8', cp: '28004', pob: 'Madrid', prov: 'Madrid', tel: '600 111 222' };

    await page.click('.nav-nueva');
    await page.fill('#f-cli-nombre', SOL.nombre);
    comprobar(await page.inputValue('#f-cli-codigo') === 'CPCS', 'el código del cliente se propone solo (CPCS)');
    // Primera factura a este cliente (hace 60 días): Fran ya le había hecho 3 → pone el 4 a mano
    const t1 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.', cliente: SOL, numero: 4, fecha: hace(60),
      concepto: 'Reparación de la fachada principal:\n- Picado y enfoscado de 45 m² de paramento.\n- Pintura con revestimiento elástico.\n- Montaje y desmontaje de andamio.',
      base: '1.000',
    });
    comprobar(t1.startsWith('Factura CPCS 4/26'), 'primera factura a este cliente con el nº que toca → CPCS 4/26 (' + t1 + ')');
    const hoja1 = await page.textContent('#previa-factura');
    comprobar(hoja1.includes('Arquitecto') && hoja1.includes('criterio de Caja del IVA') && hoja1.includes('Ruego abonen importe en la cuenta'), 'plantilla clásica: cargo, cuenta y nota legal como en sus facturas');
    comprobar(await page.inputValue('#f-vencimiento') === hace(30), 'vencimiento automático a 30 días (' + await page.inputValue('#f-vencimiento') + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('1.210,00'), 'base 1.000 € + IVA 21 % = 1.210,00 €');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-3-editor.png') });

    const t2 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.', cliente: { guardado: 'Comunidad de Propietarios Calle Sol 8 · H28123456' },
      concepto: 'Honorarios profesionales correspondientes a la dirección técnica de octubre.', base: '2.450',
    });
    comprobar(t2.startsWith('Factura CPCS 5/26'), 'siguiente factura al mismo cliente → CPCS 5/26 (' + t2 + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('2.964,50'), 'base 2.450 € + IVA 21 % = 2.964,50 € (como su factura de ejemplo)');
    comprobar(sinEspacios(await page.textContent('#previa-factura')).includes('octubre que asciende a la cantidad de 2.450,00 Euros (dos mil cuatrocientos cincuenta euros):'), 'el importe en letra se añade al concepto');

    const t3 = await hacerFactura({
      empresa: 'Construcciones Fran, S.L.',
      cliente: { nombre: 'Ayuntamiento de Getafe', cif: 'P2806500A', dir: 'Plaza de la Constitución, 1', cp: '28901', pob: 'Getafe', prov: 'Madrid' },
      concepto: 'Reparación de aceras en la calle Madrid.', base: '500', irpf: 15,
    });
    comprobar(t3.startsWith('Factura AG 1/26'), 'otro cliente empieza su propia numeración → AG 1/26 (' + t3 + ')');
    comprobar(sinEspacios(await page.textContent('#r-total')).includes('530,00'), 'con IRPF 15 %: 500 + 105 − 75 = 530,00 €');
    comprobar((await page.textContent('#previa-factura')).includes('Retención IRPF'), 'la retención de IRPF sale en la factura');

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
    comprobar((await page.textContent('#f-numero-ayuda')).includes('CPCS 6/26'), 'al elegir el cliente propone su siguiente número (CPCS 6/26)');
    await page.fill('#f-fecha', '2027-01-15');
    await page.locator('#f-fecha').dispatchEvent('change');
    comprobar((await page.textContent('#f-numero-ayuda')).includes('CPCS 1/27'), 'con fecha de 2027 la numeración vuelve a empezar (CPCS 1/27)');
    await page.fill('#f-fecha', isoLocal(HOY));
    await page.locator('#f-fecha').dispatchEvent('change');
    await page.fill('#f-numero', '4');
    await page.fill('#f-concepto', 'x');
    await page.fill('#f-base', '10');
    await page.click('#form-factura button[type=submit]');
    await page.waitForTimeout(100);
    comprobar((await textoToast()).includes('Ya existe la factura CPCS 4/26'), 'no deja repetir un número de ese cliente');
    await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.fill('#f-cli-cif', 'P2806500A');
    await page.locator('#f-cli-cif').blur();
    await page.waitForTimeout(100);
    comprobar(await page.inputValue('#f-cli-nombre') === 'Ayuntamiento de Getafe', 'al escribir el CIF de un cliente guardado, se elige ese cliente');
    comprobar((await page.textContent('#f-numero-ayuda')).includes('AG 2/26'), '…y su siguiente número (AG 2/26)');
    await page.click('#btn-nueva-factura');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.fill('#f-cli-nombre', 'Otro cliente');
    await page.fill('#f-cli-codigo', 'AG');
    await page.fill('#f-concepto', 'x');
    await page.fill('#f-base', '10');
    await page.click('#form-factura button[type=submit]');
    await page.waitForTimeout(100);
    comprobar((await textoToast()).includes('ya es del cliente Ayuntamiento de Getafe'), 'no deja usar el código de otro cliente');
    await page.click('#btn-nueva-factura');

    console.log('5. Facturas: cobradas, pendientes y vencidas');
    await ir('facturas');
    const items = () => page.locator('#c-lista .item-factura').count();
    comprobar(await items() === 4, '4 facturas en la lista');
    let tarjetas = sinEspacios(await page.textContent('#c-tarjetas'));
    comprobar(tarjetas.includes('5.504,50'), 'total facturado 1.210 + 2.964,50 + 530 + 800 = 5.504,50 €');
    await page.click('#c-estado button[data-valor=vencidas]');
    comprobar(await items() === 1 && (await page.textContent('#c-lista')).includes('CPCS 4/26'), 'filtro «Vencidas»: solo CPCS 4/26 (venció hace 30 días)');
    comprobar((await page.textContent('#c-lista .chip')).includes('Vencida'), 'la etiqueta dice «Vencida»');
    await page.click('#c-lista .item-factura .chip');
    await page.waitForTimeout(100);
    comprobar((await textoToast()).includes('Deshacer'), 'al marcarla como cobrada se puede deshacer');
    await page.click('#toast-accion');
    await page.waitForTimeout(100);
    comprobar(await items() === 1, '«Deshacer» la deja como estaba (sigue vencida)');
    await page.click('#c-lista .item-factura .chip');
    await page.waitForTimeout(100);
    comprobar(await items() === 0, 'cobrada: ya no sale en «Vencidas»');
    await page.click('#c-estado button[data-valor=""]');
    tarjetas = sinEspacios(await page.textContent('#c-tarjetas'));
    comprobar(/Cobrado\s*1\.210,00/.test(tarjetas), 'cobrado 1.210,00 €');
    comprobar(/Pendiente de cobro\s*4\.294,50/.test(tarjetas), 'pendiente 4.294,50 €');
    comprobar(/IRPF retenido\s*75,00/.test(tarjetas), 'IRPF retenido 75,00 €');
    await page.click('#c-estado button[data-valor=pendientes]');
    comprobar(await items() === 3, 'filtro «Pendientes» muestra 3');
    await page.click('#c-estado button[data-valor=""]');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-2-facturas.png') });

    console.log('6. Recordar el cobro por WhatsApp');
    await page.click('#c-lista .item-factura:has-text("CPCS 5/26") [data-recordar]');
    comprobar(await page.isVisible('#dlg-recordar'), 'se abre el recordatorio');
    const mensaje = await page.inputValue('#rec-texto');
    comprobar(mensaje.includes('CPCS 5/26') && mensaje.includes('pendiente de pago') && mensaje.includes('ES91 2100'), 'mensaje con nº, importe, «pendiente de pago» e IBAN');
    await page.evaluate(() => { window.open = (url) => { window.__abierto = url; return null; }; });
    await page.click('#rec-whatsapp');
    const enlace = await page.evaluate(() => window.__abierto || '');
    comprobar(enlace.startsWith('https://wa.me/34600111222?text=') && decodeURIComponent(enlace).includes('CPCS 5/26'), 'abre WhatsApp con el teléfono del cliente (+34 600 111 222) y el mensaje');

    console.log('7. Inicio: cifras y gráfico');
    await ir('inicio');
    comprobar(sinEspacios(await page.textContent('#ini-pendiente')) === '4.294,50 €', 'pendiente de cobro: 4.294,50 €');
    const tiles = sinEspacios(await page.textContent('#ini-tiles'));
    comprobar(/Cobrado este mes\s*1\.210,00/.test(tiles), 'cobrado este mes: 1.210,00 €');
    const barras = await page.locator('#ini-grafico .g-barra').count();
    comprobar(barras >= 1, `el gráfico pinta ${barras} mes(es) con facturas`);
    const zona = page.locator('#ini-grafico .g-hit').nth(HOY.getMonth());
    await zona.hover();
    await page.waitForTimeout(100);
    comprobar((await page.isVisible('#ini-grafico .tooltip')) && (await page.textContent('#ini-grafico .tooltip')).includes('Facturado en'), 'al pasar por encima sale el detalle del mes');
    comprobar(await page.locator('#ini-tabla tr').count() === 12, 'los datos del gráfico también están en tabla (12 meses)');
    comprobar(await page.locator('#ini-por-cobrar .item-factura').count() === 3, '«Por cobrar»: 3 facturas');
    await page.mouse.move(5, 5);
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-1-inicio.png') });

    console.log('8. CSV para el gestor');
    await ir('facturas');
    const [descargaCsv] = await Promise.all([page.waitForEvent('download'), page.click('#c-exportar')]);
    const csv = fs.readFileSync(await descargaCsv.path(), 'utf8');
    fs.writeFileSync(path.join(SALIDA, 'facturas.csv'), csv);
    comprobar(csv.split('\r\n').length === 5 && csv.includes('2450,00') && csv.includes('CPCS 4/26') && csv.includes('Retención IRPF'), 'CSV con cabecera + 4 facturas, IRPF y decimales con coma');

    console.log('9. PDF e impresión');
    await page.click('#c-lista .item-factura:has-text("CPCS 4/26") [data-pdf]');
    await page.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
    const [descargaPdf] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-descargar')]);
    const pdfApp = path.join(SALIDA, 'factura-CPCS-4-26.pdf');
    fs.copyFileSync(await descargaPdf.path(), pdfApp);
    comprobar(descargaPdf.suggestedFilename() === 'Factura CPCS 4-26 - Comunidad de Propietarios Calle Sol 8.pdf', 'nombre del PDF: ' + descargaPdf.suggestedFilename());
    comprobar(fs.readFileSync(pdfApp).subarray(0, 4).toString() === '%PDF' && paginasPDF(pdfApp) === 1, 'PDF válido de 1 página (' + Math.round(fs.statSync(pdfApp).size / 1024) + ' KB)');
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('#c-lista .item-factura:has-text("AG 1/26") [data-imprimir]');
    await page.waitForTimeout(300);
    const impresa = await page.textContent('#zona-impresion');
    comprobar(impresa.includes('Retención IRPF') && impresa.includes('criterio de Caja del IVA'), 'la factura impresa lleva la retención y la nota legal');
    const pdfImpresion = path.join(SALIDA, 'impresion-AG-1-26.pdf');
    await page.pdf({ path: pdfImpresion, preferCSSPageSize: true, printBackground: true });
    comprobar(paginasPDF(pdfImpresion) === 1, 'la factura impresa cabe en 1 página A4');
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: path.join(SALIDA, 'factura-impresa.png'), fullPage: true });
    await page.emulateMedia({ media: 'screen' });

    console.log('10. Botón «atrás», persistencia y copia de seguridad');
    await ir('inicio');
    await ir('clientes');
    await page.goBack();
    await page.waitForTimeout(150);
    comprobar(await page.isVisible('#vista-inicio'), 'el botón «atrás» vuelve a la pantalla anterior');
    await page.reload();
    await ir('facturas');
    comprobar(await items() === 4, 'los datos siguen tras recargar');
    await ir('inicio');
    comprobar(await page.isVisible('#aviso-copia'), 'Inicio avisa de que no hay copia de seguridad');
    await ir('ajustes');
    const [descargaCopia] = await Promise.all([page.waitForEvent('download'), page.click('#cp-descargar')]);
    const copia = path.join(SALIDA, 'copia.json');
    fs.copyFileSync(await descargaCopia.path(), copia);
    await ir('inicio');
    comprobar(!(await page.isVisible('#aviso-copia')), 'el aviso desaparece tras descargar la copia');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ir('inicio');
    comprobar(await page.isVisible('#ini-vacio'), 'tras borrar los datos no queda nada');
    await ir('ajustes');
    await page.setInputFiles('#cp-archivo', copia);
    await page.waitForTimeout(200);
    await ir('facturas');
    comprobar(await items() === 4, 'la copia restaura las 4 facturas');
    await page.click('.nav-nueva');
    await page.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await page.selectOption('#f-cliente', { label: 'Comunidad de Propietarios Calle Sol 8 · H28123456' });
    comprobar((await page.textContent('#f-numero-ayuda')).includes('CPCS 6/26'), 'tras restaurar, la numeración por cliente sigue (CPCS 6/26)');

    console.log('11. Modo oscuro');
    await ir('ajustes');
    await page.click('#aj-tema [data-tema=oscuro]');
    const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    comprobar(fondo === 'rgb(11, 16, 32)', 'el modo oscuro cambia los colores (' + fondo + ')');
    await ir('inicio');
    await page.screenshot({ path: path.join(SALIDA, 'escritorio-5-oscuro.png') });
    await ir('ajustes');
    await page.click('#aj-tema [data-tema=auto]');
    await ctx.close();

    /* =================== MÓVIL =================== */
    console.log('12. Móvil: app instalable y sin internet');
    const movil = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true, locale: 'es-ES' });
    await movil.clock.setFixedTime(HOY);
    const m = await movil.newPage();
    vigilarErrores(m, errores);
    const irM = async (vista) => { await m.click(`.nav-item[data-ir=${vista}]`); await m.waitForTimeout(150); };
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
    comprobar(await m.isVisible('#ini-vacio'), 'SIN INTERNET la app se abre igual');
    await m.screenshot({ path: path.join(SALIDA, 'movil-0-bienvenida.png') });
    await irM('ajustes');
    await m.setInputFiles('#cp-archivo', copia);
    await m.waitForTimeout(200);

    console.log('13. Móvil: diseño y uso');
    const nav = await m.locator('.nav').boundingBox();
    comprobar(Math.abs(nav.y + nav.height - m.viewportSize().height) <= 1, 'el menú está abajo, como en una app');
    await irM('inicio');
    await m.waitForTimeout(200);
    await m.screenshot({ path: path.join(SALIDA, 'movil-1-inicio.png') });
    await m.click('.nav-nueva');
    await m.waitForTimeout(150);
    comprobar(await m.isVisible('#barra-editor'), 'el botón + abre una factura nueva con la barra Guardar / Enviar PDF');
    await m.selectOption('#f-empresa', { label: 'Construcciones Fran, S.L.' });
    await m.selectOption('#f-cliente', { label: 'Comunidad de Propietarios Calle Sol 8 · H28123456' });
    await m.screenshot({ path: path.join(SALIDA, 'movil-2-nueva-factura.png') });
    await m.fill('#f-concepto', 'Revisión de la cubierta y sustitución de 12 tejas rotas.');
    await m.fill('#f-base', '350');
    await m.locator('#f-base').blur();
    await m.click('#btn-guardar-movil');
    await m.waitForTimeout(150);
    comprobar((await m.textContent('#titulo-editor')).includes('CPCS 6/26'), 'factura hecha desde el móvil y sin internet → CPCS 6/26');
    await m.click('#seg-editor [data-modo=previa]');
    await m.waitForTimeout(150);
    comprobar(await m.isVisible('#previa-factura .hoja') && !(await m.isVisible('#f-concepto')), '«Ver factura» enseña la factura en lugar del formulario');
    await m.screenshot({ path: path.join(SALIDA, 'movil-3-ver-factura.png') });
    await m.click('#btn-pdf-movil');
    await m.waitForFunction(() => !document.getElementById('pdf-descargar').disabled, null, { timeout: 30000 });
    comprobar((await m.textContent('#pdf-texto')).includes('PDF listo'), 'el PDF se crea en el móvil sin internet');
    await m.screenshot({ path: path.join(SALIDA, 'movil-5-pdf.png') });
    const [descargaMovil] = await Promise.all([m.waitForEvent('download'), m.click('#pdf-descargar')]);
    const pdfMovil = path.join(SALIDA, 'factura-CPCS-6-26-movil.pdf');
    fs.copyFileSync(await descargaMovil.path(), pdfMovil);
    comprobar(paginasPDF(pdfMovil) === 1, 'PDF del móvil de 1 página');
    await irM('facturas');
    const display = await m.locator('#c-lista .item-factura').first().evaluate((el) => getComputedStyle(el).gridTemplateAreas);
    comprobar(display.includes('principal'), 'en el móvil las facturas se ven como tarjetas');
    await m.click('#c-lista .item-factura:has-text("CPCS 6/26") .chip');
    await m.waitForTimeout(100);
    comprobar((await m.textContent('#c-lista .item-factura:has-text("CPCS 6/26")')).includes('Cobrada'), 'se marca como cobrada con un toque');
    await m.waitForTimeout(3200);
    await m.screenshot({ path: path.join(SALIDA, 'movil-4-facturas.png') });
    await irM('clientes');
    await m.click('#cl-lista .item-cliente');
    comprobar(await m.isVisible('#form-cliente') && !(await m.isVisible('#cl-lista')), 'al tocar un cliente se abre su ficha');
    await m.click('#cl-volver');
    comprobar(await m.isVisible('#cl-lista'), '«atrás» vuelve a la lista de clientes');
    for (const vista of ['inicio', 'facturas', 'clientes', 'ajustes']) {
      await irM(vista);
      const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
      comprobar(ancho <= m.viewportSize().width + 1, `sin scroll horizontal en «${vista}» (${ancho}px)`);
    }
    await m.click('#aj-empresas .item-empresa');
    await m.waitForTimeout(150);
    const anchoEmp = await m.evaluate(() => document.documentElement.scrollWidth);
    comprobar(anchoEmp <= m.viewportSize().width + 1, `sin scroll horizontal en la ficha de empresa (${anchoEmp}px)`);
    await m.click('.nav-nueva');
    const anchoFac = await m.evaluate(() => document.documentElement.scrollWidth);
    comprobar(anchoFac <= m.viewportSize().width + 1, `sin scroll horizontal en el editor (${anchoFac}px)`);
    await irM('ajustes');
    await m.click('#aj-tema [data-tema=oscuro]');
    await irM('inicio');
    await m.waitForTimeout(200);
    await m.screenshot({ path: path.join(SALIDA, 'movil-6-oscuro.png') });
    await movil.setOffline(false);
    await movil.close();

    console.log('14. «Ver un ejemplo» con datos inventados');
    const ejCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES' });
    await ejCtx.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
    await ejCtx.clock.setFixedTime(HOY);
    const ej = await ejCtx.newPage();
    vigilarErrores(ej, errores);
    await ej.goto(URL_APP);
    await ej.click('#btn-ejemplo');
    await ej.waitForTimeout(150);
    comprobar(await ej.isVisible('#ini-panel') && await ej.isVisible('#aviso-ejemplo'), 'carga el ejemplo y avisa de que es inventado');
    comprobar(sinEspacios(await ej.textContent('#ini-pendiente')) === '4.416,50 €', 'pendiente del ejemplo: 2.964,50 + 1.452,00 = 4.416,50 €');
    await ej.click('.nav-item[data-ir=facturas]');
    comprobar(await ej.locator('#c-lista .item-factura').count() === 3 && (await ej.textContent('#c-lista')).includes('Vencida'), '3 facturas de ejemplo, una vencida');
    await ej.click('#c-lista .item-factura:has-text("A 15/26") [data-abrir]');
    comprobar(sinEspacios(await ej.textContent('#previa-factura')).includes('(dos mil cuatrocientos cincuenta euros)'), 'la factura de ejemplo sale con la plantilla clásica e importe en letra');
    await ej.click('.nav-item[data-ir=inicio]');
    await ej.click('#btn-borrar-ejemplo');
    await ej.waitForTimeout(150);
    comprobar(await ej.isVisible('#ini-vacio') && await ej.evaluate(() => JSON.parse(localStorage.getItem('facturacion.datos.v1')).facturas.length === 0), '«Borrar el ejemplo» lo deja todo vacío');
    await ejCtx.close();

    console.log('15. Lector con IA (respuestas de Claude simuladas)');
    const iaCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES', acceptDownloads: true });
    await iaCtx.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
    await iaCtx.clock.setFixedTime(HOY);
    const peticiones = [];
    let respuestaIA = 'ok';
    await iaCtx.route('https://api.anthropic.com/**', async (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      peticiones.push({ headers: req.headers(), body: req.postDataJSON() });
      if (respuestaIA === 'clave-mala') {
        return route.fulfill({ status: 401, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
      }
      const datos = { encontrado: true, nombre: 'TALLERES MARÍTIMOS DEL TURIA SL', cif: 'B11223344', direccion: 'C/ del Puerto nº 4', cp: '46024', poblacion: 'Valencia', provincia: 'Valencia', telefono: '961 234 567', email: 'admin@talleresturia.es', nota: 'Datos sacados del encabezado del presupuesto (inventados para la prueba).' };
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({
        id: 'msg_prueba', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_details: null,
        content: [{ type: 'text', text: JSON.stringify(datos) }], usage: { input_tokens: 1200, output_tokens: 90 } }) });
    });
    const ia = await iaCtx.newPage();
    // Aquí el 401 de la clave incorrecta es a propósito: solo cuentan los errores de JavaScript no capturados.
    ia.on('pageerror', (e) => errores.push(e.message));
    await ia.goto(URL_APP);
    await ia.click('#btn-ejemplo');
    await ia.click('.nav-nueva');
    // Sin clave: el propio diálogo la pide
    let [selector] = await Promise.all([ia.waitForEvent('filechooser'), ia.click('[data-leer=factura]')]);
    await selector.setFiles(path.join(RAIZ, 'docs', 'factura-ejemplo.pdf'));
    comprobar(await ia.isVisible('#ia-paso-clave'), 'sin clave, la app la pide antes de leer');
    await ia.fill('#ia-clave-dlg', 'sk-ant-prueba-1234');
    await ia.click('#ia-clave-seguir');
    await ia.waitForSelector('#ia-paso-revisar:not([hidden])', { timeout: 15000 });
    comprobar(await ia.inputValue('#ia-nombre') === 'TALLERES MARÍTIMOS DEL TURIA SL' && await ia.inputValue('#ia-cif') === 'B11223344', 'la IA devuelve los datos del cliente para revisarlos');
    const pet = peticiones[0];
    comprobar(pet && pet.body.model === 'claude-opus-5-5' && pet.body.output_config.format.type === 'json_schema' && pet.body.fallbacks === 'default', 'petición: Claude Opus 5.5, respuesta en JSON con esquema y modelo de respaldo');
    comprobar(pet && pet.body.messages[0].content[0].type === 'document' && pet.body.messages[0].content[0].source.media_type === 'application/pdf', 'el PDF va como documento');
    comprobar(pet && pet.headers['anthropic-dangerous-direct-browser-access'] === 'true' && (pet.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), 'cabeceras del navegador y de respaldo');
    comprobar(pet && pet.body.messages[0].content[1].text.includes('DELTA ESTUDIO DE ARQUITECTURA'), 'le dice a la IA cuáles son nuestras empresas (para no confundirlas con el cliente)');
    await ia.click('#ia-usar');
    comprobar(await ia.inputValue('#f-cli-nombre') === 'TALLERES MARÍTIMOS DEL TURIA SL' && await ia.inputValue('#f-cli-cp') === '46024' && await ia.inputValue('#f-cli-email') === 'admin@talleresturia.es', 'rellena los datos del cliente en la factura');
    comprobar((await ia.textContent('#f-numero-ayuda')).includes('TMT 1/26'), 'y le propone código y número (TMT 1/26)');
    // Ficha de cliente + clave incorrecta
    ia.on('dialog', (d) => d.accept());
    await ia.click('#btn-nueva-factura');
    await ia.click('.nav-item[data-ir=clientes]');
    await ia.click('#cl-nuevo');
    respuestaIA = 'clave-mala';
    [selector] = await Promise.all([ia.waitForEvent('filechooser'), ia.click('[data-leer=cliente]')]);
    await selector.setFiles(path.join(RAIZ, 'docs', 'factura-ejemplo.pdf'));
    await ia.waitForSelector('#ia-paso-clave:not([hidden])', { timeout: 15000 });
    comprobar((await ia.textContent('#ia-paso-clave')).includes('no es válida'), 'si la clave está mal, lo dice y deja ponerla de nuevo');
    respuestaIA = 'ok';
    await ia.fill('#ia-clave-dlg', 'sk-ant-otra-5678');
    await ia.click('#ia-clave-seguir');
    await ia.waitForSelector('#ia-paso-revisar:not([hidden])', { timeout: 15000 });
    await ia.click('#ia-usar');
    comprobar(await ia.inputValue('#cl-nombre') === 'TALLERES MARÍTIMOS DEL TURIA SL' && await ia.inputValue('#cl-codigo') === 'TMT', 'también rellena la ficha de un cliente nuevo');
    await ia.click('.nav-item[data-ir=ajustes]');
    comprobar((await ia.textContent('#ia-estado')).includes('…5678'), 'Ajustes muestra que la IA está activada (sin enseñar la clave)');
    const [copiaIA] = await Promise.all([ia.waitForEvent('download'), ia.click('#cp-descargar')]);
    comprobar(!fs.readFileSync(await copiaIA.path(), 'utf8').includes('sk-ant-'), 'la clave de la IA no va en la copia de seguridad');
    await iaCtx.close();

    console.log('16. Abrir con doble clic (file://) sigue funcionando');
    const local = await browser.newContext();
    const l = await local.newPage();
    const erroresLocal = [];
    l.on('pageerror', (e) => erroresLocal.push(e.message));
    await l.goto('file://' + path.join(RAIZ, 'index.html'));
    comprobar(await l.isVisible('#ini-vacio') && erroresLocal.length === 0, 'abre desde el archivo sin errores');
    await local.close();

    console.log('17. Cuentas: usuario y contraseña por persona, datos en la nube (emuladores de Firebase)');
    if (!(await emuladoresListos())) {
      if (process.env.SIN_NUBE) console.log('    · emuladores no disponibles: se salta (SIN_NUBE=1)');
      else comprobar(false, 'los emuladores de Firebase no arrancan (Java 11+ y npx). Para saltar esta parte: SIN_NUBE=1');
    } else {
      await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
      await fetch(`${FS_EMU}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
      const contextoNube = async (opciones, activarNube = true) => {
        const c = await browser.newContext({ locale: 'es-ES', ...opciones });
        await c.addInitScript(([conf, activar]) => {
          try {
            localStorage.setItem('facturacion.instalar.cerrado', '1');
            if (activar) localStorage.setItem('facturacion.nube.prueba', conf);
          } catch (e) { /* nada */ }
        }, [JSON.stringify(CONFIG_NUBE_PRUEBA), activarNube]);
        await c.clock.setFixedTime(HOY);
        const pg = await c.newPage();
        vigilarErrores(pg, errores, true);
        return [c, pg];
      };
      const entrar = async (pg, usuario, clave, crear = false) => {
        await pg.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
        await pg.click(`#acceso-modo [data-modo=${crear ? 'crear' : 'entrar'}]`);
        await pg.fill('#ac-usuario', usuario);
        await pg.fill('#ac-clave', clave);
        if (crear) await pg.fill('#ac-clave2', clave);
        await pg.click('#ac-boton');
      };

      // Dispositivo A (ordenador): crea la cuenta «fran»
      const [ctxA, a] = await contextoNube({ viewport: { width: 1440, height: 1000 } });
      await a.goto(URL_APP);
      await a.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      comprobar(await a.isVisible('#ac-usuario') && await a.isVisible('#ac-clave'), 'al abrir la app pide usuario y contraseña');
      await a.screenshot({ path: path.join(SALIDA, 'escritorio-cuenta-acceso.png') });
      await entrar(a, 'Fran', 'corta', true);
      comprobar((await a.textContent('#ac-error')).includes('al menos 6'), 'contraseña demasiado corta: lo dice');
      await entrar(a, 'Fran', 'clave-de-fran', true);
      await a.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      comprobar(await a.isVisible('#ini-vacio') && (await a.textContent('#nav-pie')).includes('fran'), 'cuenta «fran» creada: entra con la app vacía');
      await a.click('#btn-ejemplo');
      const uidFran = await uidDe(a);
      comprobar(await esperarNube(async () => (await docsNube(uidFran, 'facturas')).length === 3 && (await docsNube(uidFran, 'empresas')).length === 1),
        'las empresas y facturas se guardan en la cuenta (en la nube)');

      // Dispositivo B (móvil): la misma cuenta en otro dispositivo
      const [ctxB, b] = await contextoNube({ ...devices['Pixel 7'] });
      await b.goto(URL_APP);
      await b.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-acceso.png') });
      await entrar(b, 'fran', 'otra-clave');
      await b.waitForSelector('#ac-error:not([hidden])', { timeout: 20000 });
      comprobar((await b.textContent('#ac-error')).includes('Usuario o contraseña incorrectos'), 'contraseña incorrecta: no entra y lo explica');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-error.png') });
      await entrar(b, 'fran', 'clave-de-fran');
      await b.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      await b.waitForFunction(() => document.querySelector('#ini-pendiente').textContent.replace(/\s/g, ' ') === '4.416,50 €', null, { timeout: 20000 }).catch(() => {});
      comprobar(sinEspacios(await b.textContent('#ini-pendiente')) === '4.416,50 €', 'en el móvil, con el mismo usuario, salen todos sus datos');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-inicio.png') });

      // B marca una factura como cobrada → A lo ve al momento, sin recargar
      await b.click('.nav-item[data-ir=facturas]');
      await b.click('#c-lista .item-factura:has-text("A 15/26") [data-estado]');
      await a.waitForFunction(() => document.querySelector('#ini-pendiente').textContent.replace(/\s/g, ' ') === '1.452,00 €', null, { timeout: 20000 }).catch(() => {});
      comprobar(sinEspacios(await a.textContent('#ini-pendiente')) === '1.452,00 €', 'lo que se cambia en el móvil aparece solo en el ordenador (tiempo real)');

      // A, SIN INTERNET: sigue funcionando y lo sube al volver la conexión
      await a.click('.nav-item[data-ir=facturas]');
      await ctxA.setOffline(true);
      await a.click('#c-lista .item-factura:has-text("CP 3/26") [data-estado]');
      await a.click('.nav-item[data-ir=ajustes]');
      comprobar((await a.textContent('#cuenta-sync')).includes('Sin conexión'), 'sin internet: avisa de que se subirá luego');
      await a.reload();
      await a.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      comprobar(await a.isVisible('#vista-ajustes') && (await a.textContent('#nav-pie')).includes('fran'), 'sin internet, la app vuelve a abrir con la sesión y los datos');
      await ctxA.setOffline(false);
      comprobar(await esperarNube(async () => (await docsNube(uidFran, 'facturas')).filter((f) => f.cobrada && f.cobrada.booleanValue).length === 2, 25000),
        'al volver internet, el cambio hecho sin conexión se sube a la cuenta');
      await b.waitForFunction(() => !document.querySelector('#c-lista').textContent.includes('Pendiente'), null, { timeout: 20000 }).catch(() => {});
      comprobar(!(await b.textContent('#c-lista')).includes('Pendiente'), 'y llega también al móvil');

      // Otra persona («mama»): tenía datos en su móvil de antes de las cuentas → los pasa a su cuenta
      const [ctxC, c] = await contextoNube({ viewport: { width: 1280, height: 900 } }, false);
      await c.goto(URL_APP);
      await c.click('#btn-ejemplo');
      await c.click('.nav-item[data-ir=facturas]');
      await c.click('#c-lista .item-factura:has-text("A 14/26") [data-abrir]');
      await c.fill('#f-concepto', 'Factura de antes de tener cuenta');
      await c.click('#form-factura button[type=submit]');
      await c.evaluate((conf) => localStorage.setItem('facturacion.nube.prueba', conf), JSON.stringify(CONFIG_NUBE_PRUEBA));
      await c.reload();
      await entrar(c, 'fran', 'lo-que-sea', true);
      await c.waitForSelector('#ac-error:not([hidden])', { timeout: 20000 });
      comprobar((await c.textContent('#ac-error')).includes('ya existe'), 'no deja crear un usuario que ya existe');
      await entrar(c, 'mama', 'clave-de-mama', true);
      await c.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      const uidMama = await uidDe(c);
      comprobar(await esperarNube(async () => (await docsNube(uidMama, 'facturas')).some((f) => f.concepto && f.concepto.stringValue === 'Factura de antes de tener cuenta')),
        'los datos que ya tenía en el dispositivo pasan a su cuenta (lo pregunta antes)');
      comprobar(uidMama !== uidFran && (await docsNube(uidFran, 'facturas')).every((f) => f.concepto.stringValue !== 'Factura de antes de tener cuenta'), 'cada persona tiene sus datos: lo de «mama» no aparece en la cuenta de «fran»');

      // Las reglas de seguridad: con la sesión de «mama» no se pueden leer ni escribir los datos de «fran»
      const sesion = await (await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-clave`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'mama@usuarios.facturacion.app', password: 'clave-de-mama', returnSecureToken: true }),
      })).json();
      const urlDocs = (uid) => `${FS_EMU}/v1/projects/${PROYECTO}/databases/(default)/documents/usuarios/${uid}/facturas`;
      const leerAjeno = await fetch(urlDocs(uidFran), { headers: { Authorization: 'Bearer ' + sesion.idToken } });
      const escribirAjeno = await fetch(urlDocs(uidFran) + '?documentId=intruso', { method: 'POST', headers: { Authorization: 'Bearer ' + sesion.idToken, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { id: { stringValue: 'intruso' } } }) });
      const leerPropio = await fetch(urlDocs(uidMama), { headers: { Authorization: 'Bearer ' + sesion.idToken } });
      const sinSesion = await fetch(urlDocs(uidMama));
      comprobar(leerAjeno.status === 403 && escribirAjeno.status === 403 && leerPropio.status === 200 && sinSesion.status === 403,
        `reglas: nadie puede leer ni escribir los datos de otro, ni entrar sin sesión (${leerAjeno.status}/${escribirAjeno.status}/${leerPropio.status}/${sinSesion.status})`);

      // Cerrar sesión en el móvil: vuelve a pedir usuario y no deja sus datos en el dispositivo
      await b.click('.nav-item[data-ir=ajustes]');
      comprobar((await b.textContent('#panel-cuenta')).includes('fran'), 'Ajustes → «Mi cuenta» muestra el usuario');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-ajustes.png'), fullPage: false });
      await Promise.all([b.waitForEvent('load', { timeout: 20000 }), b.click('#cuenta-salir')]);
      await b.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      comprobar(await b.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('facturacion.datos'))), 'al cerrar la sesión vuelve a pedir el usuario y borra la copia del dispositivo');
      // ¿Ha olvidado la contraseña? Con un nombre de usuario (no un correo), la cambia quien gestiona la app
      await b.fill('#ac-usuario', 'fran');
      await b.click('#ac-olvido');
      comprobar((await b.textContent('#ac-info')).includes('no es un correo'), '«¿Has olvidado la contraseña?» explica qué hacer');
      const salidaClave = execFileSync('python3', [path.join(RAIZ, 'herramientas', 'cambiar-clave.py'), PROYECTO, 'fran', 'clave-nueva-fran'], { env: { ...process.env, EMULADOR: '1' } }).toString();
      await entrar(b, 'fran', 'clave-nueva-fran');
      await b.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      comprobar(salidaClave.includes('Contraseña cambiada') && (await b.textContent('#nav-pie')).includes('fran'), 'herramientas/cambiar-clave.py le pone una contraseña nueva y ya puede entrar');
      // Y la contraseña se puede cambiar
      await c.click('.nav-item[data-ir=ajustes]');
      await c.click('#cuenta-cambiar summary');
      await c.fill('#cu-actual', 'clave-de-mama');
      await c.fill('#cu-nueva', 'nueva-clave-mama');
      await c.click('#cu-guardar');
      await c.waitForFunction(() => document.querySelector('#toast').textContent.includes('Contraseña cambiada'), null, { timeout: 15000 }).catch(() => {});
      comprobar((await c.textContent('#toast')).includes('Contraseña cambiada'), 'se puede cambiar la contraseña');
      await Promise.all([ctxA.close(), ctxB.close(), ctxC.close()]);
    }
  } finally {
    await browser.close();
    servidor.kill();
  }

  comprobar(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  console.log(fallos ? `\n${fallos} comprobación(es) FALLIDA(S)` : '\nTodo correcto ✔');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
