/*
 * Genera los iconos de la app (PNG) en la carpeta iconos/.
 *   node herramientas/generar-iconos.cjs
 * Dibuja un SVG (documento con «€» sobre fondo azul) y lo exporta con Chromium (Playwright).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const COLOR = '#1f4e79';
const DESTINO = path.resolve(__dirname, '..', 'iconos');

function svg({ radio, escala }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radio}" fill="${COLOR}"/>
  <g transform="translate(256 256) scale(${escala}) translate(-256 -262)">
    <path d="M166 92h138l78 78v240a20 20 0 0 1-20 20H166a20 20 0 0 1-20-20V112a20 20 0 0 1 20-20z" fill="#fff"/>
    <path d="M304 92v58a20 20 0 0 0 20 20h58z" fill="#bcd0e4"/>
    <rect x="182" y="196" width="112" height="18" rx="9" fill="${COLOR}" opacity=".3"/>
    <rect x="182" y="234" width="164" height="18" rx="9" fill="${COLOR}" opacity=".3"/>
    <text x="264" y="396" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="138" text-anchor="middle" fill="${COLOR}">€</text>
  </g>
</svg>`;
}

const ICONOS = [
  { archivo: 'icono-192.png', tam: 192, radio: 96, escala: 0.96 },
  { archivo: 'icono-512.png', tam: 512, radio: 96, escala: 0.96 },
  { archivo: 'icono-maskable-512.png', tam: 512, radio: 0, escala: 0.74 }, // zona segura del 80 %
  { archivo: 'apple-touch-icon.png', tam: 180, radio: 0, escala: 0.86 },
];

(async () => {
  fs.mkdirSync(DESTINO, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const ic of ICONOS) {
    const datos = await page.evaluate(async ({ codigo, tam }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(codigo);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = tam;
      c.getContext('2d').drawImage(img, 0, 0, tam, tam);
      return c.toDataURL('image/png');
    }, { codigo: svg(ic), tam: ic.tam });
    fs.writeFileSync(path.join(DESTINO, ic.archivo), Buffer.from(datos.split(',')[1], 'base64'));
    console.log('✔', ic.archivo);
  }
  fs.writeFileSync(path.join(DESTINO, 'icono.svg'), svg({ radio: 96, escala: 0.96 }));
  console.log('✔ icono.svg');
  await browser.close();
})();
