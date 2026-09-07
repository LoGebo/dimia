// Ventana limpia para grabar la app: perfil nuevo, una sola pestaña, sin barras.
// La ventana abre directo en panel.dimia.mx; `recorrido.mjs` la maneja después.
import puppeteer from 'puppeteer-core';

const navegador = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  userDataDir: '/private/tmp/dimia-demo-perfil',
  defaultViewport: null,
  args: [
    '--window-size=1440,900',
    '--window-position=40,80',
    '--remote-debugging-port=9555',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-features=Translate,TranslateUI',
    '--lang=es-MX',
    '--app=https://panel.dimia.mx/entrar', // sin barra de direcciones ni pestañas
  ],
});
console.log('ventana lista · CDP 9555');
await new Promise(() => {});
