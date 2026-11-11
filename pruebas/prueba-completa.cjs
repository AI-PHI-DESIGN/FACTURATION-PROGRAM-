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

/** Para las pruebas sin cuentas: «facturacion.nube.prueba» = 'null' desactiva CONFIG_NUBE en ese navegador. */
const sinNube = (ctx) => ctx.addInitScript(() => {
  try { if (!localStorage.getItem('facturacion.nube.prueba')) localStorage.setItem('facturacion.nube.prueba', 'null'); } catch (e) { /* nada */ }
});

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
    await sinNube(ctx);
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
    const detalleMes = (await page.isVisible('#ini-grafico .tooltip')) ? await page.textContent('#ini-grafico .tooltip') : '';
    comprobar(detalleMes.includes('Ingresos') && detalleMes.includes('Gastos') && detalleMes.includes('Diferencia'), 'al pasar por encima sale el detalle del mes (ingresos, gastos y diferencia)');
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
    await sinNube(movil);
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
    await sinNube(ejCtx);
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
    await sinNube(iaCtx);
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
    await ia.waitForSelector('#ia-paso-error:not([hidden])', { timeout: 15000 });
    comprobar((await ia.textContent('#ia-error')).includes('imagen') && await ia.isVisible('#ia-con-clave') && peticiones.length === 0,
      'sin clave, un PDF escaneado no se manda a la IA: lo explica y ofrece «Usar la IA»');
    await ia.click('#ia-con-clave');
    comprobar(await ia.isVisible('#ia-paso-clave'), '«Usar la IA» pide la clave');
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
    await sinNube(local);
    const l = await local.newPage();
    const erroresLocal = [];
    l.on('pageerror', (e) => erroresLocal.push(e.message));
    await l.goto('file://' + path.join(RAIZ, 'index.html'));
    comprobar(await l.isVisible('#ini-vacio') && erroresLocal.length === 0, 'abre desde el archivo sin errores');
    await local.close();

    console.log('17. Cuentas: correo y contraseña por persona, datos en la nube (emuladores de Firebase)');
    {
      // Con CONFIG_NUBE tal cual (el proyecto real), la app pide correo y contraseña. No se entra: solo se mira.
      const real = await browser.newContext({ locale: 'es-ES' });
      const r = await real.newPage();
      vigilarErrores(r, errores, true);
      await r.goto(URL_APP);
      await r.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      const conf = await r.evaluate(() => window.CONFIG_NUBE && window.CONFIG_NUBE.firebase.projectId);
      comprobar(!!conf && await r.isVisible('#ac-usuario'), `con la configuración real (proyecto «${conf}»), al abrir pide correo y contraseña`);
      await real.close();
    }
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
            else if (!localStorage.getItem('facturacion.nube.prueba')) localStorage.setItem('facturacion.nube.prueba', 'null');
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
      comprobar(await esperarNube(async () => (await docsNube(uidFran, 'gastos')).length === 10), 'los gastos también se guardan en la cuenta');

      // Dispositivo B (móvil): la misma cuenta en otro dispositivo
      const [ctxB, b] = await contextoNube({ ...devices['Pixel 7'] });
      await b.goto(URL_APP);
      await b.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-acceso.png') });
      await entrar(b, 'fran', 'otra-clave');
      await b.waitForSelector('#ac-error:not([hidden])', { timeout: 20000 });
      comprobar((await b.textContent('#ac-error')).includes('Correo o contraseña incorrectos'), 'contraseña incorrecta: no entra y lo explica');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-error.png') });
      await entrar(b, 'fran', 'clave-de-fran');
      await b.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      await b.waitForFunction(() => document.querySelector('#ini-pendiente').textContent.replace(/\s/g, ' ') === '4.416,50 €', null, { timeout: 20000 }).catch(() => {});
      comprobar(sinEspacios(await b.textContent('#ini-pendiente')) === '4.416,50 €', 'en el móvil, con el mismo usuario, salen todos sus datos');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-inicio.png') });

      await b.click('.nav-item[data-ir=gastos]');
      await b.waitForFunction(() => document.querySelectorAll('#g-lista .item-gasto').length === 10, null, { timeout: 20000 }).catch(() => {});
      comprobar(await b.locator('#g-lista .item-gasto').count() === 10, 'en el móvil salen también los 10 gastos');
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
      comprobar((await c.textContent('#ac-error')).includes('Ya hay una cuenta'), 'no deja crear una cuenta que ya existe');
      await entrar(c, 'mama@ejemplo', 'clave-de-mama', true);
      comprobar((await c.textContent('#ac-error')).includes('correo válido'), 'pide un correo válido');
      await entrar(c, 'Mama@Ejemplo.es ', 'clave-de-mama', true);
      await c.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      const uidMama = await uidDe(c);
      comprobar(await esperarNube(async () => (await docsNube(uidMama, 'facturas')).some((f) => f.concepto && f.concepto.stringValue === 'Factura de antes de tener cuenta')),
        'los datos que ya tenía en el dispositivo pasan a su cuenta (lo pregunta antes)');
      comprobar(uidMama !== uidFran && (await docsNube(uidFran, 'facturas')).every((f) => f.concepto.stringValue !== 'Factura de antes de tener cuenta'), 'cada persona tiene sus datos: lo de «mama» no aparece en la cuenta de «fran»');

      // Un logo enorme (2.400 × 1.600 px con ruido, varios MB en PNG) se reduce para que la empresa quepa en la cuenta
      const logoEnorme = Buffer.from(await c.evaluate(() => {
        const cv = document.createElement('canvas'); cv.width = 2400; cv.height = 1600;
        const x = cv.getContext('2d'); const im = x.createImageData(cv.width, cv.height);
        for (let i = 0; i < im.data.length; i++) im.data[i] = (i % 4 === 3) ? 255 : Math.floor(Math.random() * 256);
        x.putImageData(im, 0, 0);
        return cv.toDataURL('image/png').split(',')[1];
      }), 'base64');
      const logoNube = async () => { const e = (await docsNube(uidMama, 'empresas'))[0]; return e && e.logo ? e.logo.stringValue : ''; };
      const logoAntes = await logoNube();
      await c.click('.nav-item[data-ir=ajustes]');
      await c.click('#aj-empresas .item-empresa');
      await c.setInputFiles('#e-logo-archivo', { name: 'logo-enorme.png', mimeType: 'image/png', buffer: logoEnorme });
      await c.waitForSelector('#e-logo-caja img');
      await c.click('#form-empresa button[type=submit]');
      comprobar(logoEnorme.length > 3e6 && await esperarNube(async () => { const l = await logoNube(); return l !== logoAntes && l.length > 100 * 1024 && l.length <= 300 * 1024; }),
        `un logo enorme (${Math.round(logoEnorme.length / 1e6)} MB) se reduce y la empresa se guarda en la cuenta (${Math.round((await logoNube()).length / 1024)} KB)`);
      await c.click('#emp-volver');

      // Con cuenta: «Restaurar…» sube a la cuenta los datos de una copia (así se carga una configuración privada)
      const [copiaMama] = await Promise.all([c.waitForEvent('download'), c.click('#cp-descargar')]);
      const copiaJson = JSON.parse(fs.readFileSync(await copiaMama.path(), 'utf8'));
      copiaJson.clientes.push({ id: 'cli-restaurado', nombre: 'Cliente de la copia restaurada', codigo: 'CR', cif: 'B00000000' });
      copiaJson.facturas.forEach((f) => { delete f.ejemplo; });
      const restaurar = async (diasSinCopia) => {
        copiaJson.ajustes.ultimaCopia = new Date(HOY.getTime() - diasSinCopia * 864e5).toISOString();
        await c.setInputFiles('#cp-archivo', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copiaJson)) });
        await c.waitForTimeout(200);
        await c.click('.nav-item[data-ir=inicio]');
        const visible = await c.isVisible('#aviso-copia');
        await c.click('.nav-item[data-ir=ajustes]');
        return visible;
      };
      const aviso40 = await restaurar(40);
      comprobar(await esperarNube(async () => (await docsNube(uidMama, 'clientes')).some((x) => x.nombre && x.nombre.stringValue === 'Cliente de la copia restaurada')),
        'con cuenta, «Restaurar…» sube a la cuenta los datos de la copia');
      const aviso20 = await restaurar(20);
      comprobar(aviso40 && !aviso20, 'con cuenta, recuerda descargar una copia al pasar un mes (a los 40 días sí, a los 20 no)');

      // Las reglas de seguridad: con la sesión de «mama» no se pueden leer ni escribir los datos de «fran»
      const sesion = await (await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-clave`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'mama@ejemplo.es', password: 'clave-de-mama', returnSecureToken: true }),
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
      comprobar(await b.isVisible('#aj-version') && (await b.textContent('#aj-version')).includes('Versión') && (await b.textContent('#aj-version')).includes('fran'),
        'en el móvil, al final de Ajustes se ve la versión y el usuario');
      await b.screenshot({ path: path.join(SALIDA, 'movil-cuenta-ajustes.png'), fullPage: false });
      await Promise.all([b.waitForEvent('load', { timeout: 20000 }), b.click('#cuenta-salir')]);
      await b.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 });
      comprobar(await b.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('facturacion.datos'))), 'al cerrar la sesión vuelve a pedir el usuario y borra la copia del dispositivo');
      // ¿Ha olvidado la contraseña? Con un nombre de usuario (no un correo), la cambia quien gestiona la app
      await b.fill('#ac-usuario', 'fran');
      await b.click('#ac-olvido');
      comprobar((await b.textContent('#ac-info')).includes('no es un correo'), '«¿Has olvidado la contraseña?» con un nombre de usuario: explica qué hacer');
      await b.fill('#ac-usuario', 'mama@ejemplo.es');
      await b.click('#ac-olvido');
      await b.waitForFunction(() => document.querySelector('#ac-info').textContent.includes('le llegará un correo'), null, { timeout: 15000 }).catch(() => {});
      const codigos = await (await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROYECTO}/oobCodes`)).json();
      comprobar((await b.textContent('#ac-info')).includes('le llegará un correo') && (codigos.oobCodes || []).some((o) => o.email === 'mama@ejemplo.es' && o.requestType === 'PASSWORD_RESET'),
        '«¿Has olvidado la contraseña?» con un correo: envía el enlace para cambiarla');
      const salidaClave = execFileSync('python3', [path.join(RAIZ, 'herramientas', 'cambiar-clave.py'), PROYECTO, 'fran', 'clave-nueva-fran'], { env: { ...process.env, EMULADOR: '1' } }).toString();
      await entrar(b, 'fran', 'clave-nueva-fran');
      await b.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      comprobar(salidaClave.includes('Contraseña cambiada') && (await b.textContent('#nav-pie')).includes('fran'), 'herramientas/cambiar-clave.py le pone una contraseña nueva y ya puede entrar');
      // Cambio de proyecto de Firebase: en el dispositivo queda la copia de una cuenta anterior → se ofrece pasarla
      const [ctxD, dd] = await contextoNube({ viewport: { width: 1280, height: 900 } });
      await dd.addInitScript(() => {
        if (localStorage.getItem('facturacion.datos.u.uid-proyecto-viejo') || localStorage.getItem('facturacion.datos.u.uid-proyecto-viejo.subido')) return;
        localStorage.setItem('facturacion.datos.u.uid-proyecto-viejo', JSON.stringify({ version: 3, empresas: [{ id: 'e-vieja', nombre: 'EMPRESA ANTIGUA SL', cif: 'B00000001' }], clientes: [], facturas: [],
          gastos: [{ id: 'g-viejo', fecha: '2026-10-01', proveedor: { nombre: 'PROVEEDOR ANTIGUO' }, categoria: 'Otros', totalCent: 1210, ivaPct: 21, baseCent: 1000, cuotaCent: 210, pagado: true }], ajustes: {} }));
      });
      await dd.goto(URL_APP);
      await entrar(dd, 'nueva@ejemplo.es', 'clave-nueva-1', true);
      await dd.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      const uidNueva = await (async () => { const h = await dd.waitForFunction(() => Object.keys(localStorage).find((k) => k.startsWith('facturacion.datos.u.') && !k.includes('viejo')), null, { timeout: 20000 }); return (await h.jsonValue()).slice('facturacion.datos.u.'.length); })();
      comprobar(await esperarNube(async () => (await docsNube(uidNueva, 'empresas')).some((e) => e.nombre.stringValue === 'EMPRESA ANTIGUA SL') && (await docsNube(uidNueva, 'gastos')).length === 1)
        && await dd.evaluate(() => !localStorage.getItem('facturacion.datos.u.uid-proyecto-viejo') && !!localStorage.getItem('facturacion.datos.u.uid-proyecto-viejo.subido')),
        'tras cambiar de proyecto de Firebase, los datos de la cuenta anterior que había en el dispositivo pasan a la cuenta nueva (lo pregunta)');
      await ctxD.close();

      // Una cuenta con las reglas ANTIGUAS de Firebase (sin gastos): la app sigue funcionando y lo explica en Gastos
      const reglas = (texto) => fetch(`${FS_EMU}/emulator/v1/projects/${PROYECTO}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: texto }] } }) });
      await reglas(fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8').replace(
        /match \/\{coleccion\}\/\{docId\} \{\s*allow read, write: if request\.auth != null && request\.auth\.uid == uid;/,
        "match /{coleccion}/{docId} { allow read, write: if request.auth != null && request.auth.uid == uid && coleccion in ['empresas', 'clientes', 'facturas'];"));
      await c.reload();
      await c.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
      await c.click('.nav-item[data-ir=gastos]');
      await c.waitForSelector('#g-sin-permiso:not([hidden])', { timeout: 15000 }).catch(() => {});
      comprobar(await c.isVisible('#g-sin-permiso'), 'con las reglas antiguas de Firebase, Gastos avisa de que falta actualizarlas');
      await c.click('.nav-item[data-ir=inicio]');
      comprobar(await c.isVisible('#ini-panel'), '… y el resto de la app sigue funcionando');
      await reglas(fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8'));
      await c.reload();
      await c.waitForSelector('#acceso', { state: 'hidden', timeout: 20000 });
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

    console.log('18. Actualizar una app ya instalada (móvil con una versión anterior)');
    {
      // Copia de la app «de antes»: sin cuentas y con otro service worker. Un servidor al que se le cambia la carpeta
      // hace de GitHub Pages publicando una versión nueva.
      const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'facturacion-'));
      const copiar = (destino, cambiar) => {
        for (const x of ['index.html', 'manifest.json', 'sw.js', 'iconos', 'vendor']) fs.cpSync(path.join(RAIZ, x), path.join(destino, x), { recursive: true });
        cambiar(destino);
        return destino;
      };
      const reescribir = (f, a, b) => { const t = fs.readFileSync(f, 'utf8'); if (!t.includes(a)) throw new Error('no está: ' + a); fs.writeFileSync(f, t.replace(a, b)); };
      const vieja = copiar(path.join(tmp, 'vieja'), (d) => {
        reescribir(path.join(d, 'index.html'), 'window.CONFIG_NUBE = {', 'window.CONFIG_NUBE = null && {');
        reescribir(path.join(d, 'index.html'), /const VERSION_APP = '[^']*';/.exec(fs.readFileSync(path.join(d, 'index.html'), 'utf8'))[0], "const VERSION_APP = '0.9';");
        reescribir(path.join(d, 'sw.js'), /const VERSION = '[^']*';/.exec(fs.readFileSync(path.join(d, 'sw.js'), 'utf8'))[0], "const VERSION = 'facturacion-vieja';");
      });
      const siguiente = copiar(path.join(tmp, 'siguiente'), (d) => {
        reescribir(path.join(d, 'index.html'), /const VERSION_APP = '[^']*';/.exec(fs.readFileSync(path.join(d, 'index.html'), 'utf8'))[0], "const VERSION_APP = '9.9';");
        reescribir(path.join(d, 'sw.js'), /const VERSION = '[^']*';/.exec(fs.readFileSync(path.join(d, 'sw.js'), 'utf8'))[0], "const VERSION = 'facturacion-siguiente';");
      });
      let carpeta = vieja;
      const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      const pages = http.createServer((req, res) => {
        let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (ruta.endsWith('/')) ruta += 'index.html';
        fs.readFile(path.join(carpeta, ruta), (e, d) => {
          if (e) { res.writeHead(404); return res.end(); }
          res.writeHead(200, { 'content-type': tipos[path.extname(ruta)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
          res.end(d);
        });
      });
      await new Promise((r) => pages.listen(0, '127.0.0.1', r));
      const urlPages = `http://127.0.0.1:${pages.address().port}/`;
      const act = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' });
      const p = await act.newPage();
      vigilarErrores(p, errores, true);
      const estado = () => p.evaluate(() => ({ acceso: !document.querySelector('#acceso').hidden, version: document.querySelector('#nav-pie').textContent }));
      await p.goto(urlPages);
      await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p.reload();
      const antes = await estado();
      carpeta = RAIZ;   // se publica la versión con cuentas
      await p.reload();
      await p.waitForSelector('#acceso-formulario:not([hidden])', { timeout: 20000 }).catch(() => {});
      const despues = await estado();
      comprobar(!antes.acceso && antes.version.includes('0.9') && despues.acceso,
        'un móvil con la versión anterior instalada ve «Crear cuenta» la PRIMERA vez que abre la app tras publicar');
      // Con la app abierta en segundo plano: se publica otra versión y, al volver a la app, se pone al día sola
      await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await p.waitForTimeout(25000);   // lleva un rato abierta
      carpeta = siguiente;
      await Promise.all([
        p.waitForEvent('load', { timeout: 30000 }).catch(() => {}),
        p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }),
      ]);
      await p.waitForFunction(() => document.querySelector('#nav-pie').textContent.includes('9.9'), null, { timeout: 15000 }).catch(() => {});
      comprobar((await estado()).version.includes('9.9'), 'al volver a la app (estaba en segundo plano), coge la versión nueva sola');
      await act.close();
      pages.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    console.log('20. Leer un PDF sin IA ni clave (en el propio dispositivo)');
    {
      const lc = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
      await lc.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
      await sinNube(lc);
      await lc.clock.setFixedTime(HOY);
      let llamadasIA = 0;
      await lc.route('https://api.anthropic.com/**', (r) => { llamadasIA++; return r.abort(); });
      const lp = await lc.newPage();
      vigilarErrores(lp, errores);
      await lp.goto(URL_APP);
      await lp.click('#btn-ejemplo');
      // Dos PDF de texto inventados: a dos columnas (nosotros a la izquierda, el cliente a la derecha) y con etiquetas
      await lp.addScriptTag({ url: './vendor/jspdf.umd.min.js' });
      const pdfs = await lp.evaluate(() => {
        const { jsPDF } = window.jspdf;
        const a = new jsPDF();
        a.setFontSize(10);
        [['DELTA ESTUDIO DE ARQUITECTURA S.L.', 'TALLERES MARÍTIMOS DEL TURIA SL'], ['C/ de la Paz, 7', 'C/ del Puerto nº 4'], ['46003 Valencia', '46024 Valencia (Valencia)'],
          ['N.I.F. nº B12345678', 'C.I.F.: B-11223344'], ['Tel. 963 000 000', 'Tel. 961 234 567'], ['info@delta.es', 'admin@talleresturia.es']]
          .forEach(([iz, de], i) => { a.text(iz, 15, 25 + i * 6); a.text(de, 115, 25 + i * 6); });
        a.text('PRESUPUESTO Nº 27      Fecha: 3 de noviembre de 2026', 15, 80);
        a.text('TOTAL 1.210,00 €', 15, 90);
        const c = new jsPDF();
        c.setFontSize(11);
        ['FACTURA 2026-118', 'Fecha: 12/10/2026', 'Cliente: COMUNIDAD DE PROPIETARIOS AV. DEL PUERTO 25', 'CIF: H98765432', 'Dirección: Avda. del Puerto, 25', 'Valencia 46023', 'Email: administracion@ejemplo-fincas.es']
          .forEach((t, i) => c.text(t, 20, 30 + i * 8));
        return [Array.from(new Uint8Array(a.output('arraybuffer'))), Array.from(new Uint8Array(c.output('arraybuffer')))];
      });
      const leer = async (bytes, nombre) => {
        const [fc] = await Promise.all([lp.waitForEvent('filechooser'), lp.click('#vista-factura [data-leer=factura]')]);
        await fc.setFiles({ name: nombre, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
        await lp.waitForSelector('#ia-paso-revisar:not([hidden]), #ia-paso-error:not([hidden])', { timeout: 20000 });
        return lp.evaluate(() => Object.fromEntries(['nombre', 'cif', 'dir', 'cp', 'pob', 'prov', 'tel', 'email'].map((k) => [k, document.getElementById('ia-' + k).value])));
      };
      await lp.click('.nav-nueva');
      const r1 = await leer(pdfs[0], 'presupuesto.pdf');
      comprobar(r1.nombre === 'TALLERES MARÍTIMOS DEL TURIA SL' && r1.cif === 'B11223344' && r1.dir === 'C/ del Puerto nº 4' && r1.cp === '46024' && r1.pob === 'Valencia' && r1.prov === 'Valencia' && r1.tel === '961 234 567' && r1.email === 'admin@talleresturia.es',
        'PDF a dos columnas: saca el cliente (no nuestra empresa) con CIF, dirección, CP, población, provincia, teléfono y email');
      comprobar((await lp.textContent('#ia-nota')).includes('sin IA') && llamadasIA === 0, 'sin clave y sin llamar a la IA');
      await lp.click('#ia-usar');
      comprobar(await lp.inputValue('#f-cli-nombre') === 'TALLERES MARÍTIMOS DEL TURIA SL' && await lp.inputValue('#f-cli-cp') === '46024', '«Usar estos datos» los pone en la factura');
      await lp.click('#btn-nueva-factura');
      const r2 = await leer(pdfs[1], 'factura-recibida.pdf');
      comprobar(r2.nombre === 'COMUNIDAD DE PROPIETARIOS AV. DEL PUERTO 25' && r2.cif === 'H98765432' && r2.dir === 'Avda. del Puerto, 25' && r2.cp === '46023' && r2.pob === 'Valencia' && r2.tel === '' && r2.email === 'administracion@ejemplo-fincas.es',
        'PDF con etiquetas («Cliente:», «CIF:», «Dirección:»…): también, y no confunde el CIF con un teléfono');
      await lp.click('#ia-cancelar');
      // Dar de alta una empresa desde una factura suya (la empresa que la emite, no el cliente)
      const pdfEmisora = await lp.evaluate(() => {
        const { jsPDF } = window.jspdf;
        const e = new jsPDF();
        e.setFontSize(10);
        [['ESTUDIO NORTE ARQUITECTOS S.L.', 'Cliente:'], ['C/ Mayor, 12, 3º', 'CONSTRUCCIONES DEL SUR SL'], ['28013 Madrid (Madrid)', 'CIF: B33445566'], ['CIF: B76543210', 'Av. de Andalucía, 5'],
          ['Tel. 915 555 123', '41001 Sevilla'], ['info@estudionorte.es', ''], ['www.estudionorte.es', '']]
          .forEach(([iz, de], i) => { e.text(iz, 15, 20 + i * 6); if (de) e.text(de, 115, 20 + i * 6); });
        ['FACTURA 12/26', 'Concepto: proyecto básico y de ejecución', 'TOTAL 2.420,00 €', 'Ruego abonen el importe en la cuenta ES91 2100 0418 4502 0005 1332',
          'Fdo.: D. Pedro Gómez Sánchez', 'Arquitecto', 'Factura acogida al criterio de Caja del IVA'].forEach((t, i) => e.text(t, 15, 80 + i * 8));
        return Array.from(new Uint8Array(e.output('arraybuffer')));
      });
      await lp.click('.nav-item[data-ir=ajustes]');
      await lp.click('#aj-nueva-empresa');
      const [fcE] = await Promise.all([lp.waitForEvent('filechooser'), lp.click('[data-leer=empresa]')]);
      await fcE.setFiles({ name: 'factura-propia.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfEmisora) });
      await lp.waitForSelector('#ia-paso-revisar:not([hidden]), #ia-paso-error:not([hidden])', { timeout: 20000 });
      const re = await lp.evaluate(() => Object.fromEntries(['nombre', 'cif', 'dir', 'cp', 'pob', 'prov', 'tel', 'email', 'web', 'iban', 'firmante', 'cargo', 'notalegal'].map((k) => [k, document.getElementById('ia-' + k).value])));
      comprobar(re.nombre === 'ESTUDIO NORTE ARQUITECTOS S.L.' && re.cif === 'B76543210' && re.dir === 'C/ Mayor, 12, 3º' && re.cp === '28013' && re.pob === 'Madrid' && re.tel === '915 555 123' && re.email === 'info@estudionorte.es',
        'empresa desde una factura suya: saca la que emite (no el cliente) con CIF, dirección, CP, teléfono y email');
      comprobar(re.web === 'www.estudionorte.es' && re.iban === 'ES91 2100 0418 4502 0005 1332' && re.firmante === 'D. Pedro Gómez Sánchez' && re.cargo === 'Arquitecto' && re.notalegal === 'Factura acogida al criterio de Caja del IVA',
        '… y también la web, el IBAN, el firmante, el cargo y la nota legal' + (re.iban ? '' : ' ' + JSON.stringify(re)));
      await lp.click('#ia-usar');
      comprobar(await lp.inputValue('#e-nombre') === 'ESTUDIO NORTE ARQUITECTOS S.L.' && await lp.inputValue('#e-iban') === 'ES91 2100 0418 4502 0005 1332' && await lp.inputValue('#e-cargo') === 'Arquitecto',
        '«Usar estos datos» rellena la ficha de la empresa nueva');
      await lc.close();
    }

    console.log('19. Gastos: apartado propio, con su color, gráficas y CSV');
    {
      const gCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-ES', acceptDownloads: true });
      await gCtx.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
      await sinNube(gCtx);
      await gCtx.clock.setFixedTime(HOY);
      const g = await gCtx.newPage();
      vigilarErrores(g, errores);
      const irG = async (vista) => { await g.click(`.nav-item[data-ir=${vista}]`); await g.waitForTimeout(120); };
      const varCSS = (n) => g.evaluate((x) => getComputedStyle(document.documentElement).getPropertyValue(x).trim(), n);
      await g.goto(URL_APP);
      await g.click('#btn-ejemplo');
      await g.waitForTimeout(150);
      const tilesG = sinEspacios(await g.textContent('#ini-tiles'));
      comprobar(/Gastos en 2026\s*3\.354,05/.test(tilesG), 'Inicio: gastos del año (3.354,05 €)');
      comprobar(/Beneficio en 2026\s*3\.256,47/.test(tilesG), 'Inicio: beneficio sin IVA = 6.100,00 − 2.843,53 = 3.256,47 €');
      comprobar(/IVA del 4\.º trimestre\s*155,18/.test(tilesG) && tilesG.includes('514,50 € repercutido − 359,32 € soportado'), 'Inicio: IVA del trimestre a pagar = repercutido − soportado (155,18 €)');
      comprobar(await g.locator('#ini-grafico .g-barra.s2').count() >= 1 && await g.isVisible('#vista-inicio .leyenda'), 'el gráfico por meses tiene ingresos y gastos, con leyenda');
      const origen = sinEspacios(await g.textContent('#ini-origen'));
      comprobar(await g.locator('#ini-origen .bh-fila').count() === 2 && /INMOBILIARIA LEVANTE GESTIÓN SL\s*5\.929 €\s*80 %/.test(origen), 'de dónde vienen los ingresos: por cliente, de más a menos, con % (80 % el primero)');
      await g.locator('#ini-origen .bh-fila').first().hover();
      comprobar((await g.textContent('#ini-origen .tooltip')).includes('2 facturas'), 'al pasar por encima, el detalle (importe, % y nº de facturas)');
      comprobar(/^Alquiler\s*2\.178 €\s*65 %/.test(sinEspacios(await g.textContent('#ini-gastos-cat'))), 'en qué se va el dinero: Alquiler primero (65 %)');
      const primarioIngresos = await varCSS('--primary');

      await irG('gastos');
      const primarioGastos = await varCSS('--primary');
      comprobar(primarioGastos === '#c2410c' && primarioGastos !== primarioIngresos && await g.evaluate(() => document.documentElement.dataset.modo === 'gastos'),
        `al entrar en Gastos toda la app cambia de color (${primarioIngresos} → ${primarioGastos})`);
      comprobar(await g.getAttribute('.nav-nueva', 'aria-label') === 'Nuevo gasto' && (await g.textContent('.nav-nueva')).includes('Nuevo gasto'), 'en Gastos, el botón «+» es «Nuevo gasto»');
      const tarjetasG = sinEspacios(await g.textContent('#g-tarjetas'));
      comprobar(/Total gastado\s*3\.354,05/.test(tarjetasG) && /IVA soportado\s*510,52/.test(tarjetasG) && /Por pagar\s*726,00/.test(tarjetasG), 'Gastos: total 3.354,05 €, IVA soportado 510,52 €, por pagar 726,00 €');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 10 && await g.locator('#g-grafico .g-barra.s2').count() === 3, '10 gastos en la lista y gráfico por meses (sep, oct, nov)');
      await g.click('#g-estado [data-valor=pendientes]');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 1, 'filtro «Por pagar»: 1 gasto');
      await g.click('#g-lista .item-gasto [data-pagado]');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 0 && (await g.textContent('#toast')).includes('pagado'), 'un toque en «Por pagar» lo marca como pagado');
      await g.click('#toast-accion');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 1, '«Deshacer» lo deja como estaba');
      await g.click('#g-estado [data-valor=""]');

      // Gasto nuevo de un proveedor que ya existe: se rellenan su CIF y su categoría
      await g.click('.nav-nueva');
      comprobar(await g.isVisible('#form-gasto') && await varCSS('--primary') === '#c2410c', 'el «+» abre un gasto nuevo (con el color de Gastos)');
      await g.click('#form-gasto button[type=submit]');
      comprobar((await g.textContent('#toast')).includes('importe'), 'sin importe no se guarda (y lo dice)');
      await g.fill('#gs-prov', 'ASESORÍA CONTABLE NORTE SL');
      await g.dispatchEvent('#gs-prov', 'change');
      comprobar(await g.inputValue('#gs-prov-cif') === 'B22222222' && await g.inputValue('#gs-categoria') === 'Gestoría y asesoría', 'al elegir un proveedor ya usado se ponen su CIF y su categoría');
      await g.fill('#gs-total', '145,20');
      comprobar(sinEspacios(await g.textContent('#gs-desglose')).includes('Base imponible 120,00 €') && sinEspacios(await g.textContent('#gs-desglose')).includes('25,20 €'), 'del total con IVA saca la base (120,00 €) y el IVA (25,20 €)');
      await g.click('#form-gasto button[type=submit]');
      comprobar(await g.isVisible('#vista-gastos') && await g.locator('#g-lista .item-gasto').count() === 11 && (await g.textContent('#toast')).includes('Gasto apuntado'), 'gasto guardado: vuelve a la lista (11 gastos)');
      // Otra categoría, sin IVA y sin pagar
      await g.click('.nav-nueva');
      await g.fill('#gs-prov', 'LIMPIEZAS DEL PUERTO');
      await g.selectOption('#gs-categoria', '__otra');
      await g.fill('#gs-cat-otra', 'Limpieza');
      await g.fill('#gs-total', '30');
      await g.selectOption('#gs-iva', '0');
      await g.click('#gs-pagado');
      await g.click('#form-gasto button[type=submit]');
      comprobar((await g.locator('#g-cat option').allTextContents()).includes('Limpieza') && sinEspacios(await g.textContent('#g-tarjetas')).includes('756,00'), 'categoría propia («Limpieza»), sin IVA y por pagar (por pagar: 756,00 €)');
      // Editar y borrar
      await g.click('#g-lista .item-gasto:has-text("LIMPIEZAS DEL PUERTO") [data-abrir]');
      comprobar(await g.inputValue('#gs-cat-otra') === '' && await g.inputValue('#gs-categoria') === 'Limpieza' && !(await g.isChecked('#gs-pagado')), 'al abrir un gasto salen sus datos');
      await g.fill('#gs-total', '45');
      await g.click('#form-gasto button[type=submit]');
      comprobar((await g.textContent('#g-lista .item-gasto:has-text("LIMPIEZAS DEL PUERTO")')).includes('45,00'), 'gasto modificado');
      await g.click('#g-lista .item-gasto:has-text("LIMPIEZAS DEL PUERTO") [data-borrar]');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 11, 'gasto borrado');
      await g.click('#toast-accion');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 12, '«Deshacer» lo recupera');
      // CSV para el gestor
      const [csvG] = await Promise.all([g.waitForEvent('download'), g.click('#g-exportar')]);
      const textoCSV = fs.readFileSync(await csvG.path(), 'utf8');
      fs.writeFileSync(path.join(SALIDA, 'gastos.csv'), textoCSV);
      comprobar(textoCSV.split('\r\n')[0].includes('Proveedor;CIF proveedor') && textoCSV.includes('ASESORÍA CONTABLE NORTE SL;B22222222') && textoCSV.includes(';120,00;21;25,20;145,20;'), 'CSV de gastos para el gestor (base, IVA y total)');
      await g.screenshot({ path: path.join(SALIDA, 'escritorio-gastos.png'), fullPage: true });

      // Al salir de Gastos, vuelve el color normal
      await irG('inicio');
      comprobar(await varCSS('--primary') === primarioIngresos && await g.evaluate(() => !document.documentElement.dataset.modo), 'al salir de Gastos vuelve el color de siempre');
      // El color se elige en Ajustes
      await irG('ajustes');
      await g.click('#aj-color-gastos [data-color="#7c3aed"]');
      await irG('gastos');
      comprobar(await varCSS('--primary') === '#7c3aed', 'el color de Gastos se elige en Ajustes (morado)');
      await irG('ajustes');
      await g.click('#aj-tema [data-tema=oscuro]');
      await irG('gastos');
      const oscuroG = await varCSS('--primary');
      comprobar(oscuroG !== '#7c3aed' && oscuroG.startsWith('#'), `en modo oscuro se usa una versión más clara del mismo color (${oscuroG})`);
      await g.screenshot({ path: path.join(SALIDA, 'escritorio-gastos-oscuro.png') });
      await irG('ajustes');
      await g.click('#aj-tema [data-tema=claro]');
      // La copia de seguridad lleva los gastos; una copia de antes (sin gastos) se puede restaurar
      const [copiaG] = await Promise.all([g.waitForEvent('download'), g.click('#cp-descargar')]);
      const jsonG = JSON.parse(fs.readFileSync(await copiaG.path(), 'utf8'));
      comprobar(jsonG.gastos.length === 12 && jsonG.ajustes.colorGastos === '#7c3aed', 'la copia de seguridad lleva los gastos y el color elegido');
      delete jsonG.gastos;
      await g.setInputFiles('#cp-archivo', { name: 'copia-antigua.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(jsonG)) });
      await irG('gastos');
      comprobar(await g.locator('#g-lista .item-gasto').count() === 0 && (await g.textContent('#g-lista')).includes('Todavía no has apuntado'), 'una copia de antes de Gastos se restaura sin problemas (sin gastos)');
      await gCtx.close();

      // Móvil: seis botones abajo, sin scroll horizontal (Pixel 7 y un móvil estrecho de 360 px)
      for (const opc of [devices['Pixel 7'], { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } }]) {
        const mc = await browser.newContext({ ...opc, locale: 'es-ES' });
        await sinNube(mc);
        await mc.addInitScript(() => { try { localStorage.setItem('facturacion.instalar.cerrado', '1'); } catch (e) { /* nada */ } });
        await mc.clock.setFixedTime(HOY);
        const mg = await mc.newPage();
        vigilarErrores(mg, errores);
        await mg.goto(URL_APP);
        await mg.click('#btn-ejemplo');
        const anchoV = mc._options.viewport.width;
        const anchos = [];
        for (const v of ['inicio', 'gastos']) { await mg.click(`.nav-item[data-ir=${v}]`); await mg.waitForTimeout(150); anchos.push(await mg.evaluate(() => document.documentElement.scrollWidth)); }
        await mg.click('.nav-nueva');
        anchos.push(await mg.evaluate(() => document.documentElement.scrollWidth));
        const botones = await mg.locator('.nav .nav-item:visible').count();
        comprobar(botones === 6 && anchos.every((a) => a <= anchoV + 1), `móvil de ${anchoV} px: 6 botones abajo y sin scroll horizontal (${anchos.join(' / ')} px)`);
        if (anchoV === 412) {
          await mg.click('.nav-item[data-ir=gastos]');
          await mg.waitForTimeout(200);
          await mg.screenshot({ path: path.join(SALIDA, 'movil-gastos.png') });
        }
        await mc.close();
      }
    }
  } finally {
    await browser.close();
    servidor.kill();
  }

  comprobar(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''));
  console.log(fallos ? `\n${fallos} comprobación(es) FALLIDA(S)` : '\nTodo correcto ✔');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
