# Prompt para Claude Design — Sitio de Dimia Consulting

> Copiar todo lo que sigue y pegarlo como prompt. Es autosuficiente: trae la marca,
> el logotipo, el ícono, los tokens y la estructura del sitio.

---

Diseña y desarrolla el sitio web de **Dimia Consulting**, una consultora mexicana que
diseña, construye y **opera** sistemas de decisión: agentes de voz, automatización,
infraestructura de datos, analítica, transformación digital y marketing medido contra
ingreso real.

Debe sentirse como una firma boutique técnica —precisa, sobria, atmosférica— con calidad de
estudio de diseño internacional, hablando claro a dueños y operadores de negocios mexicanos.
No una landing genérica de SaaS. **La página debe reconocerse como Dimia aunque se oculte el
logotipo.**

---

## 1. La marca, en una idea

**"El punto donde el dato deja de informar y empieza a decidir."**

El nombre trae dos letras `i`, y cada `i` trae un punto. Esos puntos se redibujan como
**cuadrados**, iguales al punto que cierra el nombre. **El cuadrado es la única forma
gráfica del sistema.** No hay set de íconos, no hay círculos decorativos, no hay
ilustraciones.

Frases de marca, a usar tal cual:

- «Contestamos lo que su negocio no alcanza a contestar.»
- «Sistemas de decisión para empresas que ya no alcanzan a contestar.»
- «Automatización con garantía, no con buenas intenciones.»
- «Dimia. Donde el dato decide.»

La IA es el método, nunca el argumento. El argumento es la cita que sí quedó.

---

## 2. Logotipo

El logotipo es **lettering, no texto**: Archivo 800 con las dos `i` construidas y el punto
final cuadrado. Reparto de color **«Paréntesis»**: azul al abrir y azul al cerrar, hueso en
medio. Pégalo así:

```html
<span class="dimia">D<i class="i i1"></i>m<i class="i i2"></i>a<i class="fin"></i></span>
```

```css
.dimia {
  font-family: "Archivo", ui-sans-serif, "Helvetica Neue", Arial, sans-serif;
  font-weight: 800;
  letter-spacing: -0.028em;
  line-height: 1;
  white-space: nowrap;
  display: inline-block;
  color: var(--tinta);            /* hueso sobre fondo oscuro */
}
.i {                               /* asta de la i */
  display: inline-block;
  width: .145em; height: .526em;   /* .526em = altura de x real de Archivo 800 */
  background: currentColor;
  position: relative;
  margin: 0 .075em 0 .062em;
  vertical-align: baseline;
}
.i::before {                       /* punto cuadrado de la i */
  content: "";
  position: absolute;
  left: -.008em; bottom: .611em;
  width: .16em; height: .16em;
}
.i1::before { background: var(--acento); }   /* primera i — AZUL */
.i2::before { background: currentColor; }    /* segunda i — hueso */
.fin {                                        /* punto final — AZUL */
  display: inline-block;
  width: .2em; height: .2em;
  background: var(--acento);
  margin-left: .085em;
  vertical-align: baseline;
}
```

Descriptor **CONSULTING**: IBM Plex Mono 400, versalitas, tracking `0.43em`, tamaño
`0.168em` del cuerpo del logotipo, alineado a la izquierda con la `D`.

**Zona de seguridad:** margen libre igual al lado del punto final, en los cuatro lados.
**Mínimos:** 140 px de ancho con descriptor, 90 px sin él.

Prohibido: teclear `Dimia.` con las `i` normales de la fuente · poner en azul la segunda `i`
· redondear cualquier cuadrado · escribir `DIMIA` en mayúsculas · sombras, contornos o
inclinaciones.

---

## 3. Ícono

El ícono son **las dos `i` recortadas del logotipo**. Se usa en navegación, favicon, avatar
y esquinas de plantilla; nunca sustituye al logotipo en portadas.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Dimia Consulting">
  <rect x="27" y="42" width="15" height="44" fill="#eef1f7"/>
  <rect x="27" y="18" width="15" height="15" fill="#6e9bf5"/>
  <rect x="58" y="42" width="15" height="44" fill="#eef1f7"/>
  <rect x="58" y="18" width="15" height="15" fill="#eef1f7"/>
</svg>
```

**Corrección óptica obligatoria en chico** (no escalar la versión grande):

| Tamaño | Astas | Cuadrados |
|---|---|---|
| > 32 px | `x=27` y `x=58`, ancho 15, `y=42` alto 44 | 15, en `y=18` |
| ≤ 32 px | `x=25` y `x=58`, ancho 17, `y=42` alto 44 | 17, en `y=16` |
| ≤ 16 px | `x=23` y `x=58`, ancho 19, `y=44` alto 42 | 19, en `y=14` |

Sin esa corrección el ícono colapsa en dos barras y se lee como botón de pausa — el peor
malentendido para una empresa cuyo producto es una llamada en curso.

Sobre papel: astas `#0b0f17`, primer cuadrado `#1f47c4`. En negativo: todo blanco.

---

## 4. Color

```css
:root {
  --paper:        #0b0f17;  /* tinta profunda — fondo maestro */
  --panel:        #111723;  /* superficie técnica */
  --panel-2:      #161d2b;  /* bloque elevado, código, campo */
  --linea:        #212a3a;  /* filete de 1 px */
  --linea-2:      #2f3a4d;  /* divisor de sección */
  --tinta:        #eef1f7;  /* hueso — texto principal */
  --tinta-2:      #97a2b5;  /* acero — texto secundario */
  --tinta-3:      #66718a;  /* rótulos y pies */
  --acento:       #6e9bf5;  /* azul Dimia */
  --acento-hondo: #1f47c4;  /* azul sobre superficie clara */
  --laton:        #c8a45c;  /* rótulos de sección y ceremonia */
  --papel:        #f2f4f8;  /* única superficie clara */
  --bueno:        #3fb68b;  /* confirmada */
  --alerta:       #e0a838;  /* pendiente */
  --critico:      #e2685c;  /* conflicto */
}
```

**Proporción: 72 % tinta · 20 % hueso y acero · 6 % azul · 2 % latón.** Si hay más azul que
eso, algo se está usando como decoración. No inventar colores adicionales.

Sobre papel, el azul es `#1f47c4`, el latón `#a8853f`, los estados `#12805c` · `#a9760a` ·
`#c4392f`. Máximo **dos** secciones claras en toda la página.

**Prohibido:** degradados de marca, glassmorphism, sombras, blobs, neón, malla. La única
excepción de degradado es el filete superior de sección:
`linear-gradient(90deg, transparent, var(--acento), transparent)` al 50 % de opacidad.

---

## 5. Tipografía

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300&display=swap">
```

- **Newsreader 300** — titulares editoriales y citas. Tracking `-0.012em`, interlínea 1.06–1.2.
- **Archivo 400/500/600/800** — logotipo, interfaz, cuerpo, navegación.
- **IBM Plex Mono 400/500** — cifras, horas, dinero, estados, rótulos, descriptor.

La serif editorial es lo que separa a Dimia del oscuro genérico de producto. **No cambiarla
por una sans.**

| Rol | Familia | Tamaño |
|---|---|---|
| Hero | Newsreader 300 | `clamp(34px, 5vw, 66px)`, `text-wrap: balance` |
| Título de sección | Newsreader 300 | `clamp(24px, 2.6vw, 40px)` |
| Subtítulo / interfaz | Archivo 600 | 19–21 px, tracking `-0.015em` |
| Cuerpo | Archivo 400 | 16–17.5 px, interlínea 1.62, máx. 64 caracteres |
| Dato | IBM Plex Mono 400 | 15–40 px, `font-variant-numeric: tabular-nums` |
| Rótulo | IBM Plex Mono 400/500 | 10–11 px, tracking `.2em`, versalitas |
| Rótulo de sección | IBM Plex Mono 400 | 10.5 px, tracking `.24em`, color **latón** |

Reglas fijas: cifras, horas y dinero **siempre** en mono con `tabular-nums` · el énfasis es
peso 600, nunca subrayado · los párrafos no se centran · cursiva solo en citas de Newsreader
· los titulares de sección rematan con un cuadrado azul.

---

## 6. Sistema gráfico y composición

- **El cuadrado es el único símbolo.** Viñetas de 6 px, indicadores de estado de 7 px,
  remates de titular, marcadores de navegación, nodos de diagrama.
- **Esquinas rectas en todo:** `border-radius: 0` en tarjetas, botones, campos, imágenes.
- **Sin sombras.** La profundidad se construye con tono, filetes de 1 px, escala y espacio.
- **Rejilla editorial de dos columnas** en secciones densas: rótulo de sección a la
  izquierda (mono, versalitas, latón, 190 px) y contenido a la derecha, separación 56 px.
- Ancho máximo de contenido 1280 px, padding lateral 56 px en escritorio y 20 px en móvil.
- Textura técnica muy tenue en hero y cierre: rejilla de 96 px en `#151c29` al 45–50 % de
  opacidad. Nada de partículas, estrellas ni degradados radiales.
- **Iconografía:** ninguna librería. Solo flechas mínimas dibujadas a mano:
  `<svg width="14" height="10" viewBox="0 0 14 10"><path d="M0 5h12M9 1l4 4-4 4" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`
- **Fotografía:** preferentemente ninguna. Si se usa, real, en duotono tinta/azul, en caja
  recta. Prohibido el stock de gente frente a laptops, manos con hologramas y cerebros de
  circuitos.

---

## 7. Voz

Español de México. **Usted** con el prospecto, sin excepción. Frases cortas. Resultado
primero, método después. Sin superlativos, sin signos de admiración, sin anglicismos
innecesarios.

**Palabras prohibidas:** revolucionario · solución 360 · impulsado por IA · transformación
digital como eslogan · partner estratégico · sinergia · disruptivo · ecosistema · potenciar.

Los botones dicen exactamente qué pasa: **«Agendar demostración»**, no «Empezar».

**No inventar métricas, clientes, testimonios ni resultados.** Donde falte un dato real, va
un placeholder visible: `[ dato por confirmar ]`, `[ Nombre del cliente autorizado ]`,
`[ Resultado por confirmar ]`, `[ Periodo medido ]`, `[ +52 55 0000 0000 ]`.

---

## 8. Estructura del sitio

Acción principal en toda la página: **«Agendar una demostración»**. Secundaria: **«Ver cómo
funciona»**.

**1 · Navegación** — fija, de borde a borde, sin píldora flotante. Ícono + logotipo,
enlaces Servicios · Productos · Proyectos · Método, y el botón primario. Al hacer scroll
reduce altura y sube ligeramente la opacidad del fondo.

**2 · Hero a pantalla completa.** Titular: «Contestamos lo que su negocio no alcanza a
contestar.» Bajada: «Diseñamos, construimos y operamos sistemas que atienden, agendan,
automatizan y convierten datos en decisiones.» A la derecha, **un panel operativo vivo**, no
una ilustración, con esta secuencia en bucle:

1. Llamada entrante · 2. estado **EN LLAMADA** · 3. cronómetro desde 00:00 ·
4. intención detectada · 5. consulta de disponibilidad · 6. propone jueves 4 · 18:30 ·
4 personas · 7. escribe la reserva **#A-2291** · 8. estado **CONFIRMADA** en 00:42 ·
9. aviso por WhatsApp preparado · 10. reposo y repite.

El punto azul de EN LLAMADA late cada 1.9 s **variando solo la opacidad** (1 → 0.28). Sin
rebotes, giros ni escalados.

**3 · Banda de cifras** — cuatro valores en mono grande, separados por filetes verticales,
sin tarjetas: `24/7` atención continua · `0` traslapes por diseño ·
`[ dato por confirmar ]` tiempo medio · `[ dato por confirmar ]` llamadas fuera de horario.

**4 · Servicios** — composición editorial **asimétrica**, no cinco tarjetas iguales. El
agente de voz ocupa el doble de espacio, con su propio diagrama de la anatomía de una
llamada. Los otros cuatro van en dos columnas. Cada uno lleva resultado, explicación corta,
una capacidad concreta, un pequeño diagrama o cifra —nunca un ícono ornamental— y el enlace
«Explorar servicio».

1. **Agente de voz** — «Un número que contesta 24/7, entiende, agenda en firme y avisa por WhatsApp. La cita queda escrita antes de colgar.»
2. **Automatización de operaciones** — «Confirmaciones, recordatorios, cobranza, seguimiento, altas y reportes. Automatizamos el tramo mecánico y dejamos cada acción auditada.»
3. **Datos y analítica** — «Convertimos datos dispersos en bases confiables y tableros que un dueño puede revisar sin que nadie se los explique.»
4. **Transformación digital** — «Diagnóstico, hoja de ruta y ejecución. No entregamos recomendaciones aisladas: entregamos sistemas operando.»
5. **Marketing con datos** — «Conectamos campañas con ingreso real para saber qué acción produjo cada oportunidad y cuánto valió.»

**5 · Productos** — sección propia y ampliable. **Agente de voz Dimia**, marcado «En
operación»: qué resuelve, cómo funciona, para quién, integraciones (telefonía/SIP, WhatsApp,
calendario, CRM) y CTA «Solicitar demostración». Debajo, dos renglones
`[ Nombre del producto ]` marcados **«Próximamente»**. Nada aparece antes de operar con un
cliente real.

**6 · La garantía** — una de las dos secciones claras, fondo `#f2f4f8`. Titular: «Dos citas
encimadas son imposibles por diseño.» Diagrama vertical: llamada → consulta de
disponibilidad → restricción de la base → reserva confirmada. Debajo, la demostración de la
colisión: dos bloques horarios contiguos, `17:00–17:30` en azul hondo y `17:15–17:45` en
rojo, con el rótulo «Rechazada por la base» y la nota «Se ofrece 17:45 en la misma llamada».
Una intervención mínima en latón: la cita «Automatización con garantía, no con buenas
intenciones.»

**7 · Método** — cuatro etapas en línea. Aquí **sí** van números, porque es una secuencia
real: `01 Diagnóstico — 2 semanas` · `02 Piloto — 4 semanas` · `03 Operación — continuo` ·
`04 Escala — continuo`. No numerar ninguna otra sección.

**8 · Carrusel «CONFÍAN EN DIMIA»** — franja horizontal continua, filete arriba y abajo,
40 s por vuelta, pausa en hover, detención total con `prefers-reduced-motion`. Logotipos
monocromáticos en hueso al 55 % de opacidad, 100 % en hover, altura óptica uniforme de
28 px, separación de 56 px. **Lista de datos editable.** Mientras no haya autorizaciones,
mostrar sectores: Consultorios · Restaurantes · Clínicas · Salones · Despachos · Empresas de
servicios. Nunca clientes ni logotipos inventados.

**9 · Proyectos** — selector editorial: lista de casos a la izquierda, panel de detalle a la
derecha que cambia al elegir uno (sin introducir colores nuevos). Cada caso: giro,
problema operativo, qué instaló Dimia, resultado, periodo medido y las integraciones como
dato secundario. Placeholders honestos donde falte autorización.

**10 · Capacidades** — matriz o índice técnico de dos columnas, no ocho tarjetas con
íconos: voz y atención · automatización · integración de sistemas · bases de datos ·
analítica · productos digitales · operación continua · medición de resultados.

**11 · Equipo** — **Rogelio Díaz Alanís**, Socio · Operaciones, y **Jesús Daniel Martínez
García**, Socio · Tecnología. Fotografía real en duotono tinta/azul; mientras no exista, un
bloque tipográfico con las iniciales. Nada de «apasionado» ni «visionario»: nombre,
responsabilidad y trayectoria verificable.

**12 · Cierre** — el logotipo grande con la animación de marca, el titular «Donde el dato
decide.», el teléfono `[ +52 55 0000 0000 ]` con la nota «Este número contesta con el agente
de voz de Dimia», el correo `hola@dimia.mx`, y un formulario de tres campos —nombre,
empresa, teléfono o correo— con estados completos: reposo, hover, focus visible, enviando,
error y confirmación. **No simular un envío exitoso si no hay backend:** al enviar, pasar a
«Enviando…» y luego avisar que el formulario aún no está conectado, ofreciendo teléfono y
correo.

**13 · Pie** — declaración, no cuadrícula de enlaces: logotipo, «Sistemas de decisión para
empresas que ya no alcanzan a contestar.», dos columnas cortas (Firma / Contacto), aviso de
privacidad, LinkedIn, dimia.mx, y un **cuadrado azul como remate final**.

---

## 9. Animación de marca

Una sola, y se usa dos veces: en la entrada del sitio y en el cierre.

1. Aparecen las dos astas de las `i` (380 ms, `cubic-bezier(.2,.7,.3,1)`, escala vertical
   desde la base).
2. **200 ms después** caen los cuadrados a su posición exacta (260 ms, desplazamiento de
   10 px hacia abajo, opacidad 0 → 1).
3. Sin rebote, sin giro, sin elasticidad.

---

## 10. Movimiento general

- Entrada al scroll: opacidad y 12 px de desplazamiento vertical, 400 ms, `ease-out`.
- Hover: fondo, borde u opacidad en 150 ms. **Sin escalado de tarjetas, sin elevación.**
- Sin parallax exagerado, sin cursor personalizado, sin scroll secuestrado.
- Nada compite con el panel del hero.
- `prefers-reduced-motion` detiene el carrusel, el latido del estado y los revelados; el
  panel se congela en el estado confirmado.

---

## 11. Responsive y accesibilidad

Impecable en 320, 375, 414, 768 px y escritorio amplio. Cero desplazamiento horizontal
(recortar solo en el eje X, nunca bloquear el vertical). El hero pasa a composición vertical
en móvil con el panel debajo, legible. Botones y enlaces no se parten en dos líneas. Hit
targets mínimos de 44 px.

Contraste AA como mínimo. El estado se comunica por **color y palabra**, nunca solo color.
Foco visible: `outline: 2px solid var(--acento); outline-offset: 3px`. HTML semántico,
`lang="es-MX"`, SVG decorativos con `aria-hidden="true"`, logotipo e ícono con
`role="img"` y `aria-label="Dimia Consulting"`.

---

## 12. Arquitectura

Next.js + TypeScript, Tailwind o CSS Modules, todos los tokens como variables CSS, contenido
en objetos de datos editables (servicios, productos, casos, carrusel), Framer Motion solo
donde se justifique. SEO técnico, Open Graph, sitemap y `schema.org/ProfessionalService`.
Sin librerías de íconos.

---

## 13. Antes de entregar

- [ ] ¿Se reconoce como Dimia con el logotipo tapado?
- [ ] ¿Alguna esquina redondeada o sombra? Debe haber cero.
- [ ] ¿Hay más azul que el 6 % de la pantalla?
- [ ] ¿Las cifras están en mono con `tabular-nums`?
- [ ] ¿Aparece alguna palabra de la lista prohibida?
- [ ] ¿Los titulares de sección rematan con el cuadrado azul?
- [ ] ¿El ícono a 16 px usa la versión óptica?
- [ ] ¿Alguna métrica, cliente o testimonio inventado? Fuera.
- [ ] ¿Se puede recorrer toda la página en móvil sin scroll horizontal?
