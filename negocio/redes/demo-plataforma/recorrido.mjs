/**
 * Maneja la ventana de la demo por los nueve planos del shot list.
 * Es un demo de la app: el sitio no aparece en ningún plano.
 * Recordly graba esa ventana; este script sólo mueve lo que se ve dentro.
 *
 *   node tour.mjs &                       # ventana limpia en dimia.mx (CDP 9555)
 *   PANEL_USUARIO=… PANEL_CLAVE=… node recorrido.mjs
 *
 * Las credenciales van por variable de entorno: nada de cuentas en el repo.
 *
 * Nada de scroll libre: cada desplazamiento va a un ancla y se detiene.
 */
import puppeteer from 'puppeteer-core';

const CDP = 'http://127.0.0.1:9555';
const PAUSA_CORTE = 400; // el aire antes de cada corte
const PANEL = 'https://panel.dimia.mx';
const TENANT = process.env.PANEL_NEGOCIO ?? 'bca5d234-9549-4700-8590-1dbe02af4053';

const pausa = (ms) => new Promise((s) => setTimeout(s, ms));

/** Desplaza suave hasta una posición, con la misma inercia en todos los planos. */
async function irA(p, y, ms = 1400) {
  await p.evaluate(
    (destino, dur) =>
      new Promise((listo) => {
        const inicio = window.scrollY;
        const delta = destino - inicio;
        const t0 = performance.now();
        const suave = (x) => 1 - Math.pow(1 - x, 3);
        const paso = (t) => {
          const x = Math.min(1, (t - t0) / dur);
          window.scrollTo(0, inicio + delta * suave(x));
          if (x < 1) requestAnimationFrame(paso);
          else listo();
        };
        requestAnimationFrame(paso);
      }),
    y,
    ms,
  );
}

/** Lleva el cursor en línea recta y lo detiene antes de tocar nada. */
async function cursorA(p, x, y, pasos = 22) {
  await p.mouse.move(x, y, { steps: pasos });
  await pausa(320);
}

const marca = (n, texto) => console.log(`${String(n).padStart(2, '0')} · ${new Date().toISOString().slice(14, 22)} · ${texto}`);

const navegador = await puppeteer.connect({ browserURL: CDP, defaultViewport: null });
const p = (await navegador.pages()).find((x) => x.url().includes('panel.dimia.mx')) ?? (await navegador.pages())[0];
await p.bringToFront();

// El sitio y el panel comparten la misma ventana: el corte entre ambos es una navegación.
const anclas = await p.evaluate(() =>
  Object.fromEntries(
    ['inicio', 'productos', 'garantia', 'contacto'].map((id) => [
      id,
      Math.round((document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY),
    ]),
  ),
);
console.log('anclas del sitio:', anclas);

// ------------------------------------------------------------ sesión
marca(0, 'entrando');
await p.goto(`${PANEL}/entrar`, { waitUntil: 'networkidle2' });
await p.type('input[name=email]', process.env.PANEL_USUARIO, { delay: 55 });
await p.type('input[name=password]', process.env.PANEL_CLAVE, { delay: 55 });
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  p.evaluate(() => document.querySelector('form').requestSubmit()),
]);
if (TENANT) await p.setCookie({ name: 'agenda_negocio', value: TENANT, domain: 'panel.dimia.mx', path: '/' });
if (p.url().includes('/entrar')) throw new Error('no entró: revise PANEL_USUARIO y PANEL_CLAVE');

// ----------------------------------------------------------------- 01 · hoy
marca(1, 'el tablero del día');
await p.goto(`${PANEL}/hoy`, { waitUntil: 'networkidle2' });
await pausa(1800);
await cursorA(p, 700, 430);   // la gráfica de la quincena
await pausa(4000);

// -------------------------------------------------------------- 02 · bandeja
marca(2, 'la lista de conversaciones');
await p.goto(`${PANEL}/bandeja`, { waitUntil: 'networkidle2' });
await pausa(1600);
await cursorA(p, 300, 330);   // las etiquetas: agendó, solo preguntó
await pausa(3900);

// --------------------------------------------------------- 03 · conversación
marca(3, 'la conversación que agendó');
const hilos = await p.evaluate(() =>
  [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/bandeja/')),
);
await cursorA(p, 300, 470);
await p.goto(PANEL + (hilos[2] ?? hilos[0]), { waitUntil: 'networkidle2' });
await pausa(1500);
await cursorA(p, 820, 300);   // la insignia «agendó»
await pausa(5000);

// --------------------------------------------------------------- 04 · agenda
marca(4, 'la agenda del día');
await p.goto(`${PANEL}/agenda`, { waitUntil: 'networkidle2' });
await pausa(1500);
for (let i = 0; i < 6; i++) {
  if (!(await p.evaluate(() => document.body.innerText.includes('Día libre')))) break;
  const avanzo = await p.evaluate(() => {
    const b = [...document.querySelectorAll('a,button')].find((e) => e.textContent.trim() === '›');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!avanzo) break;
  await pausa(1500);
}
await cursorA(p, 330, 470);   // la columna «Por llegar»
await pausa(4400);

// ------------------------------------------------------- 05 · cambio de estado
marca(5, 'marcar que llegó');
const caja = await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Llegó');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (caja) {
  await cursorA(p, caja.x, caja.y);
  await p.mouse.click(caja.x, caja.y);
  await pausa(2400);         // la cita cruza a «En atención»
  await cursorA(p, 900, 470);
} else {
  console.log('   (sin botón «Llegó» a la vista; se queda en la agenda)');
}
await pausa(3200);

// -------------------------------------------------------------- 06 · informe
marca(6, 'el informe');
await p.goto(`${PANEL}/resumen`, { waitUntil: 'networkidle2' });
await pausa(1700);
await cursorA(p, 620, 350);   // la tira de cifras
await pausa(1800);
await irA(p, 340, 1200);      // la gráfica por día
await pausa(2800);

// ---------------------------------------------------------- 07 · ficha de cliente
marca(7, 'la ficha de una persona');
await p.goto(`${PANEL}/clientes`, { waitUntil: 'networkidle2' });
await pausa(1400);
const fichas = await p.evaluate(() =>
  [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => /^\/clientes\/.+/.test(h || '')),
);
if (fichas.length) {
  await cursorA(p, 320, 360);
  await p.goto(PANEL + fichas[0], { waitUntil: 'networkidle2' });
  await pausa(1500);
  await cursorA(p, 640, 450); // «Qué ha pasado»
}
await pausa(3800);

// --------------------------------------------------------------- 08 · agente
marca(8, 'cómo contesta');
await p.goto(`${PANEL}/agente`, { waitUntil: 'networkidle2' });
await pausa(1600);
await cursorA(p, 420, 330);   // «Listo para contestar 5/5»
await pausa(2000);
await cursorA(p, 1080, 400);  // el saludo editable
await pausa(3400);

// --------------------------------------------------------------- 09 · cierre
marca(9, 'cierre');
await p.goto(`${PANEL}/hoy`, { waitUntil: 'networkidle2' });
await pausa(1400);
await cursorA(p, 720, 400);
await pausa(3400);

marca(10, 'fin del recorrido');
navegador.disconnect();
