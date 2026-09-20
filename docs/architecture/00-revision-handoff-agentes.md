# Revisión del handoff de agentes (2026-09-20)

Objeto: el brief `03-prompt-handoff-claude-code.md` (Hermes Agent + OAuth del usuario +
Jev + un sandbox por agente + cuotas + marketplace). Cada decisión se argumenta a favor,
se intenta refutar y se cierra con un veredicto y lo que hay que decidir.

Fuentes: cinco investigaciones con búsqueda web (20 sep 2026) y el desempaque del bundle de
Grok Bot 0.30.0 (`app.asar`) que estaba en Descargas. Lo que no se pudo verificar va marcado.

---

## Resumen

| # | Decisión del handoff | Veredicto |
|---|---|---|
| 1 | Modelo frontier siempre con OAuth del usuario (Codex o Claude Max) | **Se ajusta.** Claude Max queda fuera: Anthropic lo prohíbe por contrato y lo bloquea desde enero–febrero 2026. **Decidido: solo Codex**, zona gris tolerada, sin respaldo de clave de plataforma (si la suscripción falla, el agente se detiene y pide reconectar). |
| 2 | Hermes Agent, una instancia por agente | **Se sostiene con una precisión.** Hermes no aísla agentes dentro de un proceso («not designed for true multi-tenancy»); cada agente es **un proceso Hermes con su propio `HERMES_HOME`**, orquestado por nosotros. Hermes no trae escritorio: la caja es aparte. |
| 3 | Jev resuelve ~90 % de pasos de computer use | **Se ajusta.** Jev solo lee texto y devuelve decisiones tipadas; no ve capturas ni emite clics. Es la **puerta**; el grounding lo hace un VLM chico. Cascada de tres capas, 60–75 % fuera del frontier. |
| 4 | Un sandbox persistente con escritorio por agente | **Decidido: como Grok Bot.** Una computadora por negocio (archivos y logins compartidos) y **una pantalla propia por agente** (escritorio virtual, mouse y teclado propios). |
| 5 | E2B Desktop para el MVP, Firecracker propio a escala | **Se sostiene** si se decide tener sandbox. Fly (donde ya vive Dimia) es el camino de escala, no OVH a mano. |
| 6 | Cuotas por plan con ledger propio y corte humano | **Se sostiene.** |
| 7 | Marketplace = skills/MCP/gateway de Hermes, alcance por agente | **Se sostiene en la idea, no en la implementación** (depende de la decisión 2). |
| 8 | Economía: Dimia solo paga sandbox + Jev | **Se sostiene** con Codex; se suman los contenedores Hermes y el grounding chico. Sin respaldo de clave de plataforma por decisión explícita. |

---

## 1. OAuth del usuario como único modelo frontier

**Lo que dice el handoff.** Todo chat y computer use corre con la suscripción Codex o
Claude Max del usuario final; Dimia guarda los tokens cifrados y nunca paga tokens frontier.

**A favor.** Si funcionara, el costo del modelo desaparece del P&L; Hermes ya trae el
device-code de Codex y el path de Claude Code; el usuario paga su cupo.

**Refutación.**

- Anthropic, texto vigente hoy en `code.claude.com/docs/en/legal-and-compliance`:
  «Anthropic does not permit third-party developers to offer Claude.ai login into their own
  applications, or to route requests through Free, Pro, or Max plan credentials on behalf of
  their users. Moreover, developers may not collect, store, or intermediate Claude.ai
  credentials or session tokens.» Es exactamente el diseño del handoff, nombrado como
  prohibido. Bloqueo técnico desde el 9 de enero de 2026 (error «This credential is only
  authorized for use with Claude Code»), términos reescritos el 19–20 de febrero, opencode
  retiró el plugin. Anthropic valida cabeceras, prompt de sistema y el esquema exacto de
  herramientas para detectar clientes no oficiales. El único camino permitido: cada usuario
  corre el binario de Claude Code sin modificar y Anthropic le factura directo; Dimia no
  toca el token.
- OpenAI: el device-code de Codex sigue vivo y OpenAI endosa herramientas de terceros
  (programa Codex for OSS), pero es un endpoint no documentado ni versionado, sin programa
  de partner para reventa por un SaaS. Los límites (ventana de 5 h + tope semanal) están
  pensados para uso conversacional: 300 pasos de computer use al día revientan una ventana
  en planes chicos. Anthropic cortó sin aviso; OpenAI puede hacer lo mismo.
- Comprador. Ninguna cifra de penetración de ChatGPT Plus/Pro o Claude Max en PyMEs
  mexicanas `[ dato por confirmar ]`. Claude Max cuesta 100–200 USD/mes, entre 35 % y 70 %
  de lo que ese dueño le paga a Dimia. Pedirle además un flujo device-code choca con la
  promesa de que el cliente no es un departamento de TI. Ningún competidor del segmento
  (Grok Bot, Manus, Lindy, Zo, Operator/ChatGPT Agent, Claude Cowork) pide traer la
  suscripción de otro proveedor; todos absorben el modelo en su precio.
- Seguridad. Los tokens no tienen alcances; el refresh token rota en cada uso y varios
  workers en paralelo disparan «refresh_token_reused» y tumban la cuenta del cliente; una
  fuga expone cuentas completas de ChatGPT/Claude, no solo crédito.
- Grok Bot no hace esto. Cobra el modelo con su propia suscripción (SuperGrok / Cursor Pro)
  y un pool de uso aparte; en el bundle: «Link SuperGrok Plus or SuperGrok Heavy for Grok
  Bot access with a separate usage pool», «Allow extra usage beyond your plan, billed as you
  go». Es el dueño del modelo cobrando su modelo, no OAuth ajeno.

**Veredicto.** Claude Max es una prohibición activa; Codex es tolerancia sin contrato.

**Decidido (Gabriel, 20 sep 2026).** Solo **Codex** (ChatGPT Plus/Pro) por device-code.
Sin respaldo con clave de plataforma: si la suscripción falla o se corta, el agente se
detiene y muestra «reconecte su cuenta de ChatGPT». Jev sigue con llave de plataforma.

Consecuencias de diseño que quedan obligatorias:

- **Un solo refrescador de token por negocio.** Los refresh tokens de Codex rotan en cada
  uso; si N procesos Hermes refrescan en paralelo salta `refresh_token_reused` y la cuenta
  del cliente queda fuera. El vault refresca con lock y entrega access tokens a los agentes;
  los `auth.json` de cada Hermes nunca refrescan por su cuenta.
- **La cuota de ChatGPT es del negocio**, repartida entre sus agentes: ventana de 5 h + tope
  semanal. La cascada del §3 es lo que la estira; la interfaz muestra ese cupo aparte de las
  cuotas de Dimia y traduce el 429 del proveedor a español.
- **Riesgo aceptado y documentado:** OpenAI puede cerrar el endpoint sin aviso (Anthropic lo
  hizo). Si pasa, la plataforma entera se detiene hasta cambiar de proveedor de modelo. Por
  eso el loop habla con el modelo por una interfaz única para poder cambiar la fuente en un
  solo lugar.
- Onboarding: el cliente necesita ChatGPT Plus o Pro y pasar el device-code desde el panel.
  Referencia de costo si un día se quisiera clave de plataforma (no se construye): uso alto
  de 200 turnos + 300 pasos/día ≈ Sonnet 5 422 USD/mes, GPT-5 293, Haiku 4.5 211,
  GPT-5-mini 59, sin caché.

## 2. Hermes Agent como harness

**Lo que dice el handoff.** Todo sobre Hermes: loop, tools, memoria, skills, subagentes,
plugins de sandbox, OAuth, gateway. «No reinventar.»

**A favor.** Proyecto real y activo (v0.21.3 del 14 sep 2026, MIT, Python). Trae loop con
memoria y skills, siete backends de terminal (local, docker, ssh, singularity, modal,
daytona, vercel), pool de credenciales con cuarentena por 401/402/429, gateway a
Telegram/Discord/Slack/WhatsApp/Signal/Email. Meses de trabajo ya hechos.

**Refutación.**

- Su doc de seguridad: «Not designed for true multi-tenancy. Hermes is single-user by
  default.» El aislamiento es un `HERMES_HOME` (config, `auth.json`, `state.db`,
  `MEMORY.md`, skills) por proceso, no objetos en memoria. El dashboard tiene un solo login
  que ve todos los perfiles. Issue #104556 (abierto, P3) pide multiusuario; #71335 fue una
  corrupción de grants OAuth entre procesos; #30286 sigue abierto sobre auth compartida.
- No trae escritorio ni computer use. Los backends son shell/`execute_code`. El control de
  escritorio es un MCP de comunidad (`computer-use-linux`), no de Nous. El navegador
  «de primera» viene por suscripción a Nous Portal (Browser Use). La premisa «sandbox
  = desktop + browser» no está en Hermes.
- `delegate_task` no es un router por paso: «the pin is global: delegate_task has no
  per-task model parameter». La política de ruteo del §3 hay que construirla igual.
- El OAuth que lo hacía atractivo (§1) ya no se puede usar como base.
- `auth.json` sin cifrado documentado; interfaz de plugin de terminal no documentada.

**Veredicto.** Como librería multi-tenant no existe; como **un proceso por agente** sí es lo
que Hermes soporta bien (perfiles = `HERMES_HOME` separados).

**Decidido (Gabriel).** Una instancia Hermes por agente creado en el panel: Recepción es un
Hermes, Cotizador es otro. Se materializa así:

- Cada agente = un contenedor (Fly Machine) con su `HERMES_HOME` en volumen: memoria,
  skills, `state.db`. Parado a 0 USD cuando el agente duerme; arranca al primer mensaje.
- Orquestación nuestra: crear/arrancar/parar/borrar máquinas por `agente.id`; respaldo del
  volumen. Esto es el «servicio agentes».
- El token de Codex no vive en el contenedor: lo pide al vault del negocio (§1).
- Hermes aporta loop, herramientas, memoria, skills, `delegate_task`. Lo que no aporta y
  construimos: ruteo por paso (§3), cuotas (§6), la caja con escritorio (§4) cableada como
  backend de terminal + MCP de computer use, y la API hacia el panel.
- Consecuencia de cuota: cada agente vivo cuesta RAM fija, por eso «número de agentes» es
  una dimensión real del plan.
- Riesgos aceptados: proyecto pre-1.0 (v0.21.x), `auth.json` sin cifrado documentado (por
  eso el token no se guarda ahí), interfaz de plugin de terminal no documentada (se lee el
  código antes de la entrega #2).

## 3. Jev y el ruteo barato

**Lo que dice el handoff.** Jev (escrito «Yep» en el brief) con llave de plataforma
clasifica y ejecuta ~90 % de los pasos de computer use; el frontier del usuario es
planificador y juez.

**A favor.** El patrón «planificador caro + ejecutor barato con escalado por confianza» es el
estado del arte (Agent S2/S3, CODA, la guía de Anthropic de planner–executor con advisor,
«Step-level Optimization» con monitores de atasco). Sí se puede desviar la mayoría de los
pasos a modelos baratos.

**Refutación.**

- Jev (TypeSafe, ya integrado en `~/Desktop/jev`) devuelve decisiones tipadas
  Choice/Score/Noul con probabilidad calibrada, **solo texto**: no ve capturas ni emite
  acciones ni coordenadas. No puede hacer «captura → clic» por sí solo.
- Ningún sistema documentado llega a 90 % con un modelo barato *general*. Los modelos
  chicos sirven para *grounding* (dónde clicar), no para planear ni verificar. Cifra práctica:
  60–80 % de pasos, y la tarea falla si un paso crítico falla.
- Las suscripciones (§1) no son fuente de cómputo para bucles: Max 5x ~225 mensajes por
  5 h; 300 pasos al día se los come.

**Veredicto.** Tres capas, no dos:

1. Puerta textual barata (Jev cuando salga de la lista; mientras, un modelo chico con salida
   estructurada): ¿este turno es trivial, herramienta o necesita frontier? ¿El último paso
   tuvo éxito? Decide sobre texto y estado, nunca sobre píxeles.
2. VLM chico de grounding (Gemini Flash, GPT-5-mini, Haiku 4.5, o UI-TARS/Holo2 por API):
   captura → coordenada/acción en pasos rutinarios.
3. Frontier por API (Sonnet 5 / GPT-5): planear, recuperar errores, verificar hitos.

Costo estimado con 70/30 (Flash/Sonnet 5): ~0.26 USD por 100 pasos; 300 pasos al día
≈ 23 USD por usuario al mes; todo en Sonnet 5 ≈ 45. Precios oficiales del 20 sep 2026:
Haiku 4.5 1/5, Sonnet 5 2/10, Opus 5 5/25 (USD por Mtok entrada/salida). Y lo más barato de
todo, que Stagehand ya hace: cachear acciones de flujos repetidos y reproducirlas sin modelo
(las «rutinas»).

**Decidido.** Cascada de tres capas. El grounding chico va con llave de plataforma (es
costo Dimia, como Jev); el frontier es el Codex del negocio. Piloto de una semana con
telemetría por paso (`jev` / `grounding` / `frontier`) antes de fijar cuotas.

## 4. Un sandbox persistente con escritorio por agente

**Lo que dice el handoff.** Cada agente tiene su VM Linux con FS, perfil de navegador y
escritorio propios. Prohibido un contenedor por usuario compartido entre agentes.

**A favor.** Aislamiento limpio: sin colisión de cookies, mouse ni archivos; el estado de un
agente no contamina a otro; borrar un agente es borrar su caja.

**Refutación.**

- Grok Bot hace exactamente lo prohibido. Documentación oficial (`docs.x.ai/grok-bot/
  computer-and-apps`): «All of your Bots use the same cloud computer, sharing its files,
  browser sessions, and app logins»; las pantallas «are separate work surfaces, not separate
  security boundaries». En el bundle: «Updates the computer your assistants share… All
  assistants update together», «All screens on the shared computer are in use». Lo construyó
  Cursor (Anysphere) sobre su infra de microVMs Firecracker (`IsoEnvConfig`,
  `firecracker_version`), con snapshots, importación de cookies de Chrome por sitio, túnel de
  egress por la red del usuario y ejecución local opcional con aprobación por herramienta.
  Hasta 50 bots por cuenta. El aislamiento fuerte es entre cuentas.
- Compartir la caja tiene una ventaja de producto, no solo de costo: el usuario inicia
  sesión una vez (Gmail, SAT, su sistema de citas) y todos sus agentes la usan. Con una caja
  por agente hay que iniciar sesión N veces o sincronizar cookies, que es peor.
- Las tareas reales del comprador de Dimia (WhatsApp, Sheets, Instagram, citas) van por API.
  Lo que no tiene API (portal del SAT, PACs viejos, sistemas de reservas sin API) se resuelve
  con un navegador persistente, no con un escritorio con terminal.
- Una VM persistente con navegador + FS + terminal en manos de un dueño de consultorio, con
  historiales clínicos y RFC adentro, es superficie de ataque que Dimia tendría que operar sin
  el equipo de seguridad de xAI.

**Decidido (Gabriel): el modelo de Grok Bot.**

- **Una computadora por negocio** (microVM E2B): archivos en `/workspace`, navegador con
  las sesiones iniciadas del negocio, apps instaladas. Se pausa cuando ningún agente la usa.
- **Una pantalla por agente** («la computadorcita»): escritorio virtual propio con su
  ventana de navegador, su mouse y su teclado. Recepción y Cotizador trabajan al mismo
  tiempo sin estorbarse, viendo los mismos archivos y logins. Cada Hermes se conecta solo a
  su pantalla.
- Aislamiento fuerte entre negocios, débil entre agentes del mismo negocio; la interfaz lo
  dice con las palabras de xAI («las pantallas no son fronteras de seguridad»).
- Si un agente necesita otra cuenta del mismo sitio, se le da un perfil de navegador aparte;
  es un ajuste, no otra arquitectura.
- Integraciones por API primero (WhatsApp e Instagram ya; Google, Meta y PAC por OAuth de
  servicio a nivel negocio). El escritorio es para lo que no tiene API.

## 5. Backend del sandbox

**Lo que dice el handoff.** E2B Desktop o Daytona para el MVP; Firecracker propio en OVH o
Hetzner a escala.

**A favor de E2B.** Único que junta, en documentación primaria: Firecracker, pausa con
snapshot de FS + memoria a 0 USD de cómputo, retención indefinida, reanudación ~1 s,
plantilla oficial de escritorio (Xvfb + XFCE + noVNC), SDK de Python. Costo por agente con
uso intermitente: centavos a pocos dólares al mes. 2 vCPU / 4 GiB ≈ 0.1656 USD/h.

**Refutación.**

- Daytona pasó a código cerrado en junio 2026 y su aislamiento por defecto es Docker (Kata
  opcional). Contra la preferencia de arquitectura soberana.
- E2B: issue #884 (FS perdido en el segundo ciclo de pausa) sin nota visible de arreglo;
  `beta_pause()` sigue en beta; dos incidentes en 2026. Hay que probar 3–4 ciclos de pausa
  con escritura antes de confiar.
- Fly Machines (donde ya corre Dimia): Firecracker, parada a 0 USD, volumen 0.15 USD/GB-mes,
  ~0.089 USD/h en performance-2x. Más barato que E2B (≈ 66 vs 121 USD/mes en 24/7), pero
  sin pausa con memoria, volumen de un solo adjunto, y el escritorio/vigilante de idle lo
  construimos nosotros. Fly Sprites (enero 2026) es el producto de Fly para agentes con
  checkpoint de FS en ~1 s; ocho meses de vida, sin escritorio documentado.
- Firecracker propio en OVH/Hetzner: «Firecracker es el 5 % fácil»; faltan scheduler,
  plantillas, almacenamiento de snapshots con GC, redes por sandbox, agente invitado,
  observabilidad y cuotas. Meses para 1–2 personas. Los «11 USD por usuario» del handoff son
  un piso teórico sin contar ingeniería.
- Si la decisión del §4 es «navegador primero», los proveedores de navegador con contexto
  persistente (Browserbase, Steel, Kernel con standby sin cobro, Anchor) son una opción más
  barata y simple, a cambio de no tener nunca un escritorio.

**Veredicto.** E2B para el MVP, detrás de una interfaz de tres métodos (`crear`, `pausar`,
`reanudar` + `ejecutar`) para poder cambiar a Fly Machines/Sprites en la etapa de
crecimiento sin tocar el loop. No OVH a mano. Se justifica en el PR como pide el handoff.

**Pendiente de decidir.** E2B con la prueba de pausa previa (mi recomendación), o Fly
Machines desde el inicio aceptando construir escritorio y vigilante nosotros. Nota: los
cerebros (Hermes) van en Fly de todos modos; solo la caja con escritorio está en duda.

## 6. Cuotas, contador y corte

**Se sostiene.** Ledger en Postgres por negocio y periodo (no logs), contador en la
interfaz, corte antes del siguiente turno costoso, mensaje en español. Dimensiones: agentes
activos, turnos, pasos de computer use, minutos de caja. Las cuotas se fijan con la telemetría
del piloto del §3, no antes.
Se mantiene la dimensión «cupo de ChatGPT del negocio», mostrada aparte. Los precios 2,990 / 3,690 / 4,790 MXN se
toman del sitio como dice el handoff; los techos de agentes (1–2 / 3–5 / 8–15) son
provisionales.

## 7. Marketplace

**La idea se sostiene**: skills (formato agentskills.io, legible por humanos), conectores por
API (OAuth por servicio a nivel negocio) y canales, instalables por agente. Grok Bot separa
tres cosas que conviene copiar: conectores estructurados (recomendados sobre el navegador),
skills, y rutinas (cron + webhook con secreto). **La implementación** depende del §2: sin
Hermes, el «Skills Hub» es un directorio de archivos por negocio y los conectores son
nuestros (ya hay WhatsApp e Instagram; siguen Google Calendar/Sheets/Gmail y Meta).

## 8. Economía

Margen = `plan − (caja + contenedores Hermes + grounding chico + Jev)`. El frontier lo paga
el negocio con su ChatGPT. Orden de magnitud por negocio al mes con uso realista: caja
1–10 USD, un Fly Machine por agente parado casi todo el día 1–3 USD, grounding 2–10 USD,
Jev centavos. Cabe en 2,990 MXN con margen. Riesgo: que OpenAI cierre el endpoint; no hay
respaldo por decisión explícita.

---

## Arquitectura propuesta tras la revisión

```
Negocio (tenant, RLS)
├── Codex OAuth del negocio (vault, un solo refrescador)      ← frontier
├── Plan Dimia y cuotas: ledger Postgres, contador, corte humano
├── Computadora del negocio (E2B, microVM, pausa en idle)
│   ├── /workspace y navegador con sesiones del negocio (compartidos)
│   ├── pantalla A ← Recepción
│   └── pantalla B ← Cotizador
├── Conectores OAuth por servicio (WhatsApp, Instagram, Google, Meta, PAC…)
├── Agente A = contenedor Hermes propio (memoria, skills, rutinas) → pantalla A
├── Agente B = contenedor Hermes propio → pantalla B
└── Grupos (ya en el panel)

Ruteo por paso: Jev (puerta, texto) → grounding chico (llave Dimia) → Codex del negocio
```

Servicio nuevo `proyectos/agentes/` en Python (orquestador: vault Codex, máquinas Hermes por
agente, caja por negocio, ruteo, cuotas, API/SSE al panel), sobre el mismo Postgres y Fly que
voz y webhooks.

## Orden de entregas propuesto

1. Vault Codex por negocio (device-code desde el panel, un solo refrescador) + un contenedor
   Hermes por agente en Fly, arrancado a demanda, hablando con el panel por API/SSE.
   Criterio: Recepción y Cotizador contestan cada uno con su memoria; 401 → «reconecte su
   cuenta de ChatGPT»; dos negocios nunca comparten token.
2. Computadora del negocio en E2B: crear, pausar, reanudar, navegador persistente, una
   pantalla por agente, prueba de 4 ciclos de pausa. Criterio: dos agentes del mismo negocio
   comparten login y trabajan a la vez; dos negocios no.
3. Cascada de ruteo y piloto de una semana; fijar cuotas con datos.
4. Rutinas (cron + webhook) y caché de acciones.
5. Conectores y skills por agente (marketplace real).
6. Onboarding y precios.

## Lo que no se pudo verificar

Penetración de planes de pago de IA en PyMEs mexicanas; cifrado de `auth.json` en Hermes;
arreglo del issue #884 de E2B; precio primario de Blaxel; cifras exactas de límites de
suscripción (agregadores); benchmarks OSWorld de modelos de 2026 (agregadores); soporte de
escritorio en Fly Sprites; el estado más reciente del bloqueo de Anthropic más allá del
texto legal vigente leído hoy.
