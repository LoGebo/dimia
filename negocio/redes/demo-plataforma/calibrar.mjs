// Convierte página → pantalla midiendo, no suponiendo. Antes de medir, un clic
// real dentro de la ventana: si no tiene el foco del sistema, no recibe eventos.
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
const pausa = ms => new Promise(r=>setTimeout(r,ms));

const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9555', defaultViewport: null });
const p = (await b.pages()).find(x => x.url().startsWith('http'));
const s = await p.target().createCDPSession();
const { windowId } = await s.send('Browser.getWindowForTarget');
await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
await pausa(2500);

const pantalla = execSync("system_profiler SPDisplaysDataType | grep -m1 Resolution").toString().trim();
console.log('pantalla:', pantalla);

// Un clic en una zona muerta para tomar el foco sin activar nada del panel.
execSync('cliclick -e 1 c:760,970');
await pausa(900);

await p.evaluate(() => { window.__u=null; addEventListener('mousemove', e=>{window.__u={x:e.clientX,y:e.clientY}}, true); });
const m = [];
for (const [px,py] of [[400,400],[1000,700],[700,200]]) {
  execSync(`cliclick -e 1 m:${px},${py}`);
  await pausa(500);
  const v = await p.evaluate(()=>window.__u);
  m.push({px,py,v});
}
console.log('muestras:', JSON.stringify(m));
const ok = m.filter(x=>x.v);
if (ok.length>=2) {
  const ox = ok.map(x=>x.px-x.v.x), oy = ok.map(x=>x.py-x.v.y);
  const igual = a => a.every(v=>Math.abs(v-a[0])<=2);
  console.log('OFFSET', ox[0], oy[0], igual(ox)&&igual(oy) ? '(consistente)' : '(INCONSISTENTE)');
} else console.log('sin foco: la ventana no recibe el cursor');
console.log('viewport:', JSON.stringify(await p.evaluate(()=>({iw:innerWidth,ih:innerHeight,sx:screenX,sy:screenY}))));
b.disconnect();
