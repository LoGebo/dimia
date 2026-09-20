# Entrega #2 — Una pantalla por agente (2026-09-20)

Estado: **funciona en producción.** El agente navega en su Chromium y el panel lo muestra en vivo.

## Qué se construyó

- `proyectos/agentes/imagen/`: imagen `registry.fly.io/dimia-cerebros:hermes-v1` = Hermes
  oficial + Xvfb, openbox, Chromium, x11vnc, noVNC. `arranque.sh` lanza `pantallas.py` y
  luego el entrypoint de Hermes (`gateway run`).
- `pantallas.py` lee `/opt/data/pantallas.json` (`{agente_id: n}`) cada 5 s y mantiene por
  agente: `Xvfb :n` 1280×800, Chromium con `--remote-debugging-port 9200+n` y perfil en
  `/opt/data/profiles/<agente>/navegador`, `x11vnc` en `5900+n`, `websockify` en `6080+n`.
- Orquestador: `agente.pantalla` (número libre por negocio, hasta 50); el `config.yaml` del
  perfil lleva `browser: {backend: off, cdp_url: http://127.0.0.1:9200+n}` y toolsets
  `memory, skills, todo, web, browser, vision`; `tools.tool_search.enabled: off`.
  `POST /agentes/{id}/pantalla` despierta la máquina y firma una URL de 10 min;
  `WS /pantalla/{token}` hace de puente con el noVNC de la máquina por la red privada.
- Panel: `pantalla-vivo.tsx` (noVNC como módulo ES desde jsdelivr; el paquete npm rompe
  webpack por `await` de nivel superior), botón «Tomar el control».
- Máquina del negocio: 2 vCPU / 2 GB / 5 GB.

## Lo que se aprendió de Hermes (y hay que respetar)

- Por defecto usa la **CLI de Browser Use** y esconde `browser_*`; `browser.backend: off`
  devuelve las herramientas nativas sobre nuestro CDP.
- **`tool_search`** esconde herramientas detrás de un buscador que el modelo no siempre usa;
  apagado por perfil.
- El nombre de la sesión (`title`) es único por perfil.
- `computer_use` (escritorio, cua-driver) toma `DISPLAY` del proceso; con perfiles
  multiplexados no puede ser distinto por agente. Queda fuera hasta que una tarea real lo
  pida (opciones: un proceso Hermes por agente, o una herramienta propia por perfil).

## Aislamiento, dicho claro

Fuerte entre negocios (microVM y volumen propios). Entre agentes del mismo negocio: pantalla,
Chromium y perfil de navegador propios, pero el mismo proceso Hermes y el mismo disco, como
las «screens» de Grok Bot. Los logins **no** se comparten entre agentes todavía (cada
Chromium tiene su perfil); compartirlos es copiar cookies entre perfiles, pendiente.

## Pendiente

- Compartir sesiones de navegador entre agentes del negocio (Grok Bot importa cookies).
- Escritorio completo (`computer_use`).
- Borrar agente → cerrar su pantalla y borrar su perfil.
