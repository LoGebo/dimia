/**
 * Graba el panel en vertical, sin ventana de por medio.
 *
 * En 9:16 un recorte de una grabación apaisada deja ver una rebanada del panel.
 * Aquí el panel se renderiza directo a 540 × 900 puntos —el ancho donde se
 * reacomoda a una sola columna— y se captura a 1080 × 1800 por el protocolo de
 * Chrome. Ningún gestor de ventanas puede estorbar.
 *
 * El cursor se dibuja dentro de la página y se mueve con la misma curva que los
 * eventos de ratón, así que los estados de hover y de clic salen de verdad.
 *
 *   node grabar.mjs        # escribe public/vertical.mp4
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PANEL = process.env.PANEL_URL ?? 'http://localhost:3111';
const TENANT = process.env.PANEL_NEGOCIO ?? 'bca5d234-9549-4700-8590-1dbe02af4053';
const ANCHO = 540, ALTO = 900, ESCALA = 2;
const CUADROS = '/private/tmp/dimia-reel-cuadros';

const pausa = (ms) => new Promise((s) => setTimeout(s, ms));
const suave = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

rmSync(CUADROS, { recursive: true, force: true });
mkdirSync(CUADROS, { recursive: true });

const navegador = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb'],
});
const p = await navegador.newPage();
await p.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: ESCALA });

// ---------------------------------------------------------------- sesión
await p.goto(`${PANEL}/entrar`, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (await p.$('input[name=email]')) {
  await p.type('input[name=email]', process.env.PANEL_USUARIO ?? 'dueno@demo.mx', { delay: 30 });
  await p.type('input[name=password]', process.env.PANEL_CLAVE ?? 'demo1234', { delay: 30 });
  await Promise.all([
    p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
    p.evaluate(() => document.querySelector('form').requestSubmit()),
  ]);
}
await p.setCookie({ name: 'agenda_negocio', value: TENANT, domain: new URL(PANEL).hostname, path: '/' });

/** Cursor dibujado: un triángulo hueso con contorno de tinta, sin librerías. */
const CURSOR = `
(() => {
  if (document.getElementById('__cur')) return;
  const d = document.createElement('div');
  d.id = '__cur';
  d.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;will-change:transform;transform:translate(270px,450px)';
  d.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26">' +
    '<path d="M2 1 L2 21 L7.2 16.4 L10.6 24 L14.4 22.2 L11 14.8 L18 14.4 Z"' +
    ' fill="#eef1f7" stroke="#0b0f17" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(d);
  window.__mover = (x, y) => { d.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
})();`;

const ponerCursor = () => p.evaluate(CURSOR).catch(() => {});
await p.evaluateOnNewDocument(CURSOR);

// ------------------------------------------------------- captura de cuadros
// El protocolo sólo manda un cuadro cuando la pantalla cambia. Si se armara el
// video a ritmo constante, las pausas desaparecerían y el movimiento se
// estiraría. Por eso se guarda el instante de cada cuadro y después cada uno
// dura lo que de verdad duró.
let n = 0;
const instantes = [];
const cliente = await p.target().createCDPSession();
await cliente.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
cliente.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  writeFileSync(`${CUADROS}/${String(n).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
  instantes.push(metadata?.timestamp ?? Date.now() / 1000);
  n += 1;
  cliente.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

/** Mueve el cursor dibujado y el de verdad, juntos. */
let cx = ANCHO / 2, cy = ALTO / 2;
async function cursor(x, y, ms = 650) {
  const pasos = Math.max(6, Math.round(ms / 22));
  const x0 = cx, y0 = cy;
  for (let i = 1; i <= pasos; i++) {
    const t = suave(i / pasos);
    const px = Math.round(x0 + (x - x0) * t), py = Math.round(y0 + (y - y0) * t);
    await p.mouse.move(px, py);
    await p.evaluate((a, b) => window.__mover?.(a, b), px, py);
    await pausa(22);
  }
  cx = x; cy = y;
}

async function desplazar(y, ms = 900) {
  await p.evaluate((d, dur) => new Promise((ok) => {
    const i = window.scrollY, dl = d - i, t0 = performance.now();
    const s = (x) => 1 - Math.pow(1 - x, 3);
    const f = (t) => { const x = Math.min(1, (t - t0) / dur); window.scrollTo(0, i + dl * s(x)); x < 1 ? requestAnimationFrame(f) : ok(); };
    requestAnimationFrame(f);
  }), y, ms);
  await pausa(120);
}

/** Busca por texto y devuelve el centro visible; baja hasta él si hace falta. */
async function centro(texto) {
  const buscar = (s) => {
    const util = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    return [...document.querySelectorAll('a,button,h1,h2,h3,div,span,td,p')]
      .filter(util).find((x) => (x.textContent || '').trim().startsWith(s));
  };
  const fuera = await p.evaluate((s, fn) => {
    const e = eval(`(${fn})`)(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 60) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; }
    return false;
  }, texto, buscar.toString());
  if (fuera === null) { console.log('   (no encontré:', texto, ')'); return null; }
  if (fuera) await pausa(1000);
  return p.evaluate((s, fn) => {
    const e = eval(`(${fn})`)(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, texto, buscar.toString());
}

async function señalar(texto, { pulsar = false, ms = 650 } = {}) {
  const c = await centro(texto);
  if (!c) return false;
  await cursor(c.x, c.y, ms);
  await pausa(280);
  if (pulsar) { await p.mouse.click(c.x, c.y); await pausa(1300); }
  return true;
}

const marca = (t) => console.log(`${new Date().toISOString().slice(17, 22)} · ${t}`);
const t0 = Date.now();
const hito = (t) => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s · ${t}`);

// ------------------------------------------------------------------ recorrido
marca('grabando');
await p.goto(`${PANEL}/hoy`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ponerCursor(); await pausa(1400);
hito('hoy');
await señalar('Llamadas de la quincena', { ms: 800 });
await pausa(1600);
await desplazar(520, 1100);
await pausa(1500);

hito('mensajes');
await p.goto(`${PANEL}/bandeja`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ponerCursor(); await pausa(1300);
await señalar('Jorge Estrada', { ms: 800 });
await pausa(1200);
const hilos = await p.evaluate(() => [...document.querySelectorAll('a[href^="/bandeja/"]')].map((a) => a.getAttribute('href')));
if (hilos[2] ?? hilos[0]) {
  const c = await p.evaluate((h) => { const e = document.querySelector(`a[href="${h}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, hilos[2] ?? hilos[0]);
  if (c) { await cursor(c.x, c.y, 400); await p.mouse.click(c.x, c.y); }
}
await pausa(1800); await ponerCursor();
hito('la conversación');
await desplazar(320, 1000);
await pausa(2200);

hito('agenda');
await p.goto(`${PANEL}/agenda`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ponerCursor(); await pausa(1400);
await señalar('Próximas citas', { ms: 700 });
await pausa(1400);
await desplazar(360, 1000);
await pausa(2000);

hito('informe');
await p.goto(`${PANEL}/resumen`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ponerCursor(); await pausa(1400);
await señalar('Resueltas sin humano', { ms: 800 });
await pausa(1800);
await desplazar(620, 1100);
await pausa(2000);

hito('el agente');
await p.goto(`${PANEL}/agente`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await ponerCursor(); await pausa(1400);
await señalar('Listo para contestar', { ms: 800 });
await pausa(2200);
hito('fin');

await cliente.send('Page.stopScreencast');
await navegador.close();

// -------------------------------------------------------------- a video
const segundos = (Date.now() - t0) / 1000;
console.log(`${n} cuadros en ${segundos.toFixed(1)} s`);
mkdirSync('public', { recursive: true });

// Lista con la duración real de cada cuadro. El último se repite: ffconcat
// ignora la duración del final si no hay otra entrada después.
const base = instantes[0];
const lineas = ['ffconcat version 1.0'];
for (let i = 0; i < n; i++) {
  const dur = i + 1 < n ? instantes[i + 1] - instantes[i] : 0.4;
  lineas.push(`file '${CUADROS}/${String(i).padStart(5, '0')}.jpg'`);
  lineas.push(`duration ${Math.max(0.01, dur).toFixed(4)}`);
}
lineas.push(`file '${CUADROS}/${String(n - 1).padStart(5, '0')}.jpg'`);
writeFileSync(`${CUADROS}/lista.txt`, lineas.join('\n'));
console.log(`duración medida: ${(instantes[n - 1] - base).toFixed(1)} s`);

execSync(
  `ffmpeg -v error -y -safe 0 -f concat -i ${CUADROS}/lista.txt ` +
  `-vf "fps=30,scale=1080:1800:flags=lanczos" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p public/vertical.mp4`,
  { stdio: 'inherit' },
);
console.log('public/vertical.mp4');
execSync('ffprobe -v error -show_entries format=duration -show_entries stream=width,height -of default=noprint_wrappers=1 public/vertical.mp4', { stdio: 'inherit' });
