// Rinde las laminas a PNG con una sola instancia de Chrome, por CDP.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const [, , SRC, DST, PORT = '9333'] = process.argv;
mkdirSync(DST, { recursive: true });

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const n = ++id;
    pend.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', {
  targetId, flatten: true,
});
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable');
await S('Runtime.enable');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const archivos = readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
for (const f of archivos) {
  const n = basename(f, '.html');
  const alto = n.includes('Reel') ? 1920 : 1350;
  await S('Emulation.setDeviceMetricsOverride', {
    width: 1080, height: alto, deviceScaleFactor: 1, mobile: false,
  });
  await S('Page.navigate', { url: 'file://' + resolve(SRC, f) });

  // Espera a que el ajuste tipografico termine (lo marca el propio documento)
  let listo = false;
  for (let i = 0; i < 100; i++) {
    await espera(60);
    const r = await S('Runtime.evaluate', {
      expression: "document.documentElement.dataset.listo || ''",
      returnByValue: true,
    }).catch(() => null);
    if (r && r.result && r.result.value === '1') { listo = true; break; }
  }
  if (!listo) console.error('sin ajustar: ' + n);
  await espera(80);

  const { data } = await S('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1080, height: alto, scale: 1 },
    captureBeyondViewport: true,
  });
  writeFileSync(`${DST}/${n}.png`, Buffer.from(data, 'base64'));
  process.stdout.write(`${n} `);
}
console.log('\n' + archivos.length + ' laminas');
await send('Target.closeTarget', { targetId });
ws.close();
