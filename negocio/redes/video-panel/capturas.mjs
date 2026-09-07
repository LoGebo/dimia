// Vuelve a tomar las capturas del panel que usa el video.
//
//   cd proyectos/voz/web && npm run seed:demo && npx next dev -p 3111
//   node capturas.mjs
//
// Playwright se agota con este panel; Chrome por CDP tarda segundos.

import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const TENANT = process.env.TENANT ?? "bca5d234-9549-4700-8590-1dbe02af4053"; // clínica con agenda
const SALIDA = new URL("./public/panel/", import.meta.url).pathname;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esperar = (ms) => new Promise((s) => setTimeout(s, ms));
mkdirSync(SALIDA, { recursive: true });

const navegador = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--font-render-hinting=none"],
});
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

await pagina.goto(`${BASE}/entrar`, { waitUntil: "networkidle2" });
await pagina.type("input[name=email]", "dueno@demo.mx");
await pagina.type("input[name=password]", "demo1234");
await Promise.all([
  pagina.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  pagina.evaluate(() => document.querySelector("form").requestSubmit()),
]);
await pagina.setCookie({ name: "agenda_negocio", value: TENANT, domain: "localhost", path: "/" });

const tirar = async (nombre) => {
  // El botón flotante de ayuda estorba en el encuadre.
  await pagina
    .addStyleTag({ content: '[class*="fixed"][class*="rounded-full"]{display:none!important}' })
    .catch(() => {});
  await esperar(600);
  await pagina.screenshot({ path: `${SALIDA}${nombre}.png` });
  console.log("ok", nombre, pagina.url());
};

await pagina.goto(`${BASE}/hoy`, { waitUntil: "networkidle2" });
await esperar(1500);
await tirar("hoy");

// La agenda solo tiene citas en día hábil: avanza hasta encontrar uno.
await pagina.goto(`${BASE}/agenda`, { waitUntil: "networkidle2" });
await esperar(1500);
for (let i = 0; i < 6; i++) {
  if (!(await pagina.evaluate(() => document.body.innerText.includes("Día libre")))) break;
  const avanzo = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll("a,button")].find((e) => e.textContent.trim() === "›");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!avanzo) break;
  await esperar(1800);
}
await tirar("agenda");

// La conversación que sí agendó es la tercera de la lista.
await pagina.goto(`${BASE}/bandeja`, { waitUntil: "networkidle2" });
await esperar(1500);
const hilos = await pagina.evaluate(() =>
  [...document.querySelectorAll("a")]
    .map((a) => a.getAttribute("href"))
    .filter((h) => h?.startsWith("/bandeja/")),
);
await pagina.goto(BASE + (hilos[2] ?? hilos[0]), { waitUntil: "networkidle2" });
await esperar(2000);
await tirar("bandeja");

await pagina.goto(`${BASE}/resumen`, { waitUntil: "networkidle2" });
await esperar(2000);
await tirar("informe");

await pagina.goto(`${BASE}/agente`, { waitUntil: "networkidle2" });
await esperar(1500);
await tirar("agente");

await navegador.close();
