/**
 * Maneja la app por los nueve planos del shot list, con el cursor REAL del
 * sistema. Es lo único que graba Recordly: el puntero que dibuja Chrome por
 * dentro no existe para la pantalla, así que aquí se mueve el del sistema con
 * `cliclick` y los clics son clics de verdad.
 *
 *   node tour.mjs &        # ventana limpia a pantalla completa (CDP 9555)
 *   node recorrido.mjs     # el recorrido
 *
 * Para grabar producción: PANEL_URL=https://panel.dimia.mx PANEL_USUARIO=… PANEL_CLAVE=…
 * Las credenciales van por variable de entorno: nada de cuentas en el repo.
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';

const PANEL = process.env.PANEL_URL ?? 'http://localhost:3111';
const TENANT = process.env.PANEL_NEGOCIO ?? 'bca5d234-9549-4700-8590-1dbe02af4053'; // clínica con agenda
const pausa = (ms) => new Promise((s) => setTimeout(s, ms));

const navegador = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9555', defaultViewport: null });
const p = (await navegador.pages()).find((x) => x.url().startsWith('http'));

/** Dónde cae, en la pantalla, el punto (0,0) de la página. */
const g = await p.evaluate(() => ({ sx: screenX, sy: screenY, oh: outerHeight, ih: innerHeight }));
const OX = g.sx, OY = g.sy + (g.oh - g.ih);
console.log('desplazamiento pantalla:', OX, OY);

/** Mueve el cursor del sistema, con inercia: Recordly lo ve y lo sigue. */
const cursor = (x, y, ms = 700) => { execSync(`cliclick -e ${ms} m:${Math.round(OX + x)},${Math.round(OY + y)}`); };
const clic = (x, y) => { execSync(`cliclick -e 1 c:${Math.round(OX + x)},${Math.round(OY + y)}`); };

/**
 * Lleva el cursor al centro de un elemento y, si se pide, lo pulsa.
 * Si el elemento está fuera de cuadro lo trae con un desplazamiento suave:
 * un elemento invisible no sirve ni para señalarlo ni para pulsarlo.
 */
async function señalar(selectorOTexto, { pulsar = false, espera = 700 } = {}) {
  const encontrar = (s) => {
    const util = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    let e = null;
    try { e = [...document.querySelectorAll(s)].find(util); } catch { /* no era selector */ }
    if (!e) e = [...document.querySelectorAll('a,button,h1,h2,h3,div,span,td,p')].filter(util)
      .find((x) => (x.textContent || '').trim().startsWith(s));
    return e;
  };

  const hayQueBajar = await p.evaluate((s, fn) => {
    const e = eval(`(${fn})`)(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const dentro = r.top >= 40 && r.bottom <= innerHeight - 40;
    if (!dentro) { e.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true; }
    return false;
  }, selectorOTexto, encontrar.toString());

  if (hayQueBajar === null) { console.log('   (no encontré:', selectorOTexto, ')'); return false; }
  if (hayQueBajar) await pausa(1100);

  const caja = await p.evaluate((s, fn) => {
    const e = eval(`(${fn})`)(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, selectorOTexto, encontrar.toString());

  if (!caja || caja.y < 0 || caja.y > 900) { console.log('   (fuera de cuadro:', selectorOTexto, ')'); return false; }
  cursor(caja.x, caja.y, espera);
  await pausa(400);
  if (pulsar) { clic(caja.x, caja.y); await pausa(1400); }
  return true;
}

const marca = (n, t) => console.log(`${String(n).padStart(2, '0')} · ${new Date().toISOString().slice(14, 22)} · ${t}`);

// --------------------------------------------------------------- sesión
marca(0, 'entrando');
await p.goto(`${PANEL}/entrar`, { waitUntil: 'networkidle2' });
// Si la sesión sigue viva, `/entrar` redirige y no hay formulario que llenar.
if (await p.$('input[name=email]')) {
  await p.type('input[name=email]', process.env.PANEL_USUARIO ?? 'dueno@demo.mx', { delay: 40 });
  await p.type('input[name=password]', process.env.PANEL_CLAVE ?? 'demo1234', { delay: 40 });
  await Promise.all([
    p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    p.evaluate(() => document.querySelector('form').requestSubmit()),
  ]);
} else {
  console.log('   (sesión ya abierta)');
}
// El negocio que sale en cámara: el que tiene agenda con citas.
await p.setCookie({ name: 'agenda_negocio', value: TENANT, domain: new URL(PANEL).hostname, path: '/' });
if (p.url().includes('/entrar')) throw new Error('no entró: revise PANEL_USUARIO y PANEL_CLAVE');
cursor(735, 460, 300);

// ------------------------------------------------------------- 01 · hoy
marca(1, 'el tablero del día');
await p.goto(`${PANEL}/hoy`, { waitUntil: 'networkidle2' });
await pausa(1600);
await señalar('Llamadas de la quincena', { espera: 900 });
await pausa(3200);

// --------------------------------------------------------- 02 · bandeja
marca(2, 'la lista de conversaciones');
await señalar('Mensajes', { pulsar: true, espera: 800 });
await p.goto(`${PANEL}/bandeja`, { waitUntil: 'networkidle2' });
await pausa(1500);
await señalar('a[href^="/bandeja/"]', { espera: 800 });
await pausa(3400);

// ---------------------------------------------------- 03 · conversación
marca(3, 'la conversación que agendó');
const hilos = await p.evaluate(() => [...document.querySelectorAll('a[href^="/bandeja/"]')].map((a) => a.getAttribute('href')));
const objetivo = hilos[2] ?? hilos[0];
const caja = await p.evaluate((h) => {
  const e = document.querySelector(`a[href="${h}"]`); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}, objetivo);
if (caja) { cursor(caja.x, caja.y, 800); await pausa(350); clic(caja.x, caja.y); await pausa(2200); }
await señalar('agendó', { espera: 700 });
await pausa(3800);

// ---------------------------------------------------------- 04 · agenda
marca(4, 'la agenda del día');
await p.goto(`${PANEL}/agenda`, { waitUntil: 'networkidle2' });
await pausa(1500);
for (let i = 0; i < 6; i++) {
  if (!(await p.evaluate(() => document.body.innerText.includes('Día libre')))) break;
  const av = await p.evaluate(() => {
    const b = [...document.querySelectorAll('a,button')].find((e) => e.textContent.trim() === '›');
    if (!b) return false; b.click(); return true;
  });
  if (!av) break;
  await pausa(1500);
}
await señalar('Por llegar', { espera: 900 });
await pausa(3600);

// --------------------------------------------- 05 · la cita cambia de estado
marca(5, 'marcar que llegó');
const llego = await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Llegó');
  if (!b) return null;
  const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (llego) {
  cursor(llego.x, llego.y, 900);
  await pausa(450);
  clic(llego.x, llego.y);
  await pausa(2400);          // la cita cruza a «En atención»
  await señalar('En atención', { espera: 700 });
} else {
  console.log('   (sin botón «Llegó» a la vista)');
}
await pausa(3000);

// --------------------------------------------------------- 06 · informe
marca(6, 'el informe');
await p.goto(`${PANEL}/resumen`, { waitUntil: 'networkidle2' });
await pausa(1700);
await señalar('Resueltas sin humano', { espera: 900 });
await pausa(2200);
await señalar('Llamadas por día', { espera: 800 });
await pausa(2600);

// -------------------------------------------------- 07 · ficha de cliente
marca(7, 'la ficha de una persona');
await p.goto(`${PANEL}/clientes`, { waitUntil: 'networkidle2' });
await pausa(1400);
const fichas = await p.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => /^\/clientes\/.+/.test(h || '')));
if (fichas.length) {
  const c = await p.evaluate((h) => {
    const e = document.querySelector(`a[href="${h}"]`); if (!e) return null;
    const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, fichas[0]);
  if (c) { cursor(c.x, c.y, 800); await pausa(350); clic(c.x, c.y); await pausa(2200); }
  await señalar('Qué ha pasado', { espera: 700 });
}
await pausa(3200);

// ---------------------------------------------------------- 08 · agente
marca(8, 'cómo contesta');
await p.goto(`${PANEL}/agente`, { waitUntil: 'networkidle2' });
await pausa(1600);
await señalar('Listo para contestar', { espera: 900 });
await pausa(2200);
await señalar('Cómo contesta', { espera: 800 });
await pausa(2800);

// ---------------------------------------------------------- 09 · cierre
marca(9, 'cierre');
await p.goto(`${PANEL}/hoy`, { waitUntil: 'networkidle2' });
await pausa(1500);
cursor(735, 430, 900);
await pausa(3000);

marca(10, 'fin del recorrido');
navegador.disconnect();
