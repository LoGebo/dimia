/**
 * Maneja la ventana de la demo por los diez planos del shot list.
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
const PANEL = 'https://panel.dimia.mx';
const TENANT = 'bca5d234-9549-4700-8590-1dbe02af4053';

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
const p = (await navegador.pages()).find((x) => x.url().includes('dimia.mx')) ?? (await navegador.pages())[0];
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

// ---------------------------------------------------------------- 01 · hero
marca(1, 'hero');
await irA(p, 0, 200);
await pausa(5300);

// ------------------------------------------------------------ 02 · productos
marca(2, 'agente de voz');
await irA(p, anclas.productos + 120, 1500);
await pausa(1200);
await cursorA(p, 390, 540); // ficha: qué resuelve / para quién / integra con
await pausa(3000);

// -------------------------------------------------- 03 · secuencia en vivo
marca(3, 'secuencia de demostración');
await cursorA(p, 1080, 450); // el widget «Línea principal»
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /demostraci[oó]n|reproducir|iniciar/i.test(e.textContent || ''));
  b?.click();
});
await pausa(6700);

// ------------------------------------------------------------- 04 · garantía
marca(4, 'colisión de horarios');
await irA(p, anclas.garantia + 380, 1500);
await pausa(1000);
await cursorA(p, 740, 620); // la reserva rechazada por la base
await pausa(4800);

// ---------------------------------------------------------------- 05 · panel
marca(5, 'panel · hoy');
await p.goto(`${PANEL}/entrar`, { waitUntil: 'networkidle2' });
await p.type('input[name=email]', process.env.PANEL_USUARIO, { delay: 55 });
await p.type('input[name=password]', process.env.PANEL_CLAVE, { delay: 55 });
await Promise.all([
  p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  p.evaluate(() => document.querySelector('form').requestSubmit()),
]);
await p.setCookie({ name: 'agenda_negocio', value: TENANT, domain: 'panel.dimia.mx', path: '/' });
await p.goto(`${PANEL}/hoy`, { waitUntil: 'networkidle2' });
await pausa(1600);
await cursorA(p, 700, 430); // la gráfica de la quincena
await pausa(3500);

// -------------------------------------------------------------- 06 · bandeja
marca(6, 'la conversación');
await p.goto(`${PANEL}/bandeja`, { waitUntil: 'networkidle2' });
await pausa(1300);
const hilos = await p.evaluate(() =>
  [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/bandeja/')),
);
await cursorA(p, 300, 380);
await p.goto(PANEL + (hilos[2] ?? hilos[0]), { waitUntil: 'networkidle2' });
await pausa(1400);
await cursorA(p, 800, 420); // la insignia «agendó»
await pausa(4600);

// --------------------------------------------------------------- 07 · agenda
marca(7, 'agenda del día');
await p.goto(`${PANEL}/agenda`, { waitUntil: 'networkidle2' });
await pausa(1400);
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
await cursorA(p, 330, 470); // la columna «Por llegar»
await pausa(4300);

// -------------------------------------------------------------- 08 · informe
marca(8, 'informe');
await p.goto(`${PANEL}/resumen`, { waitUntil: 'networkidle2' });
await pausa(1600);
await cursorA(p, 620, 350); // la tira de cifras
await pausa(1600);
await irA(p, 320, 1100);
await pausa(3200);

// --------------------------------------------------------------- 09 · agente
marca(9, 'configuración del agente');
await p.goto(`${PANEL}/agente`, { waitUntil: 'networkidle2' });
await pausa(1500);
await cursorA(p, 420, 330); // «Listo para contestar 5/5»
await pausa(3600);

// --------------------------------------------------------------- 10 · cierre
marca(10, 'contacto');
await p.goto('https://dimia.mx', { waitUntil: 'networkidle2' });
await pausa(600);
await irA(p, anclas.contacto + 60, 1500);
await pausa(1200);
await cursorA(p, 300, 500); // el teléfono
await pausa(3000);

marca(11, 'fin del recorrido');
navegador.disconnect();
