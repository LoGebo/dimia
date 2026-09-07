// Ventana limpia para grabar la app: perfil nuevo, sin pestañas, sin barra de
// direcciones y sin el aviso de «controlado por software de pruebas», que sale
// en cuadro si no se quita.
//
// Abre en el panel local; con PANEL_URL apunta a producción.
import puppeteer from 'puppeteer-core';

const PANEL = process.env.PANEL_URL ?? 'http://localhost:3111';

const navegador = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  userDataDir: '/private/tmp/dimia-demo-perfil',
  defaultViewport: null,
  // Sin esto Chrome pinta la barra amarilla de automatización sobre el panel.
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--window-size=1440,900',
    '--window-position=30,60',
    '--remote-debugging-port=9555',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-features=Translate,TranslateUI',
    '--disable-translate',
    '--lang=es-MX',
    `--app=${PANEL}/entrar`,
  ],
});

const p = (await navegador.pages()).find((x) => x.url().startsWith('http')) ?? (await navegador.pages())[0];
await new Promise((r) => setTimeout(r, 1500));

const g = await p.evaluate(() => ({ sx: screenX, sy: screenY, iw: innerWidth, ih: innerHeight, oh: outerHeight }));
console.log('ventana lista · CDP 9555 ·', JSON.stringify(g));
console.log('desplazamiento pantalla:', g.sx, g.sy + (g.oh - g.ih));
await new Promise(() => {});
