# Demo de la app · shot list

Recorrido de **60 segundos** dentro de `panel.dimia.mx`. Es un demo del producto, no del
sitio: no aparece la página de venta en ningún plano. Todo lo que se ve existe hoy en la
app; no hay maqueta ni pantalla de relleno.

## De dónde sale

| Superficie | URL | Acceso |
|---|---|---|
| App | `https://panel.dimia.mx` | **pendiente: cuenta de producción** |

`dueno@demo.mx / demo1234` es la cuenta del panel local; en producción no entra —la probé y
se queda en `/entrar`—. Las credenciales van por variable de entorno (`PANEL_USUARIO`,
`PANEL_CLAVE`) y no se escriben en ningún archivo del repo.

El negocio que salga en cámara debe tener movimiento real: conversaciones en la bandeja,
citas en la agenda y llamadas en el informe. Un negocio en ceros se ve vacío y hunde la
demo. La cookie `agenda_negocio` fija cuál es; su identificador va en la constante `TENANT`
de `recorrido.mjs`.

## Shot list

| # | Segundos | Pantalla | Acción | Voz en ese beat |
|---|---|---|---|---|
| 01 | 0.0 – 6.5 | `/hoy` | Abre el tablero. Acercamiento a la gráfica de la quincena y a la tira de avisos. | «Este es el panel de Dimia. Aquí llega todo lo que el agente contestó por usted.» |
| 02 | 6.5 – 13.0 | `/bandeja` | La lista de conversaciones, con sus etiquetas: agendó, solo preguntó, pidió una persona. | «En Mensajes está cada conversación que entró, por teléfono y por WhatsApp.» |
| 03 | 13.0 – 20.5 | `/bandeja/…` | Clic en la conversación que agendó. Zoom al hilo y pausa de 0.4 s en la insignia «agendó». | «Ábrala y lea qué le preguntaron, qué respondió el agente y en qué terminó.» |
| 04 | 20.5 – 27.5 | `/agenda` | El día con sus citas. Zoom a la columna «Por llegar» y a la primera ficha, con hora y responsable. | «Lo que agendó ya está en la agenda, con su hora y su responsable.» |
| 05 | 27.5 – 34.0 | `/agenda` | Clic en «Llegó» de una cita: pasa de «Por llegar» a «En atención». Pausa de 0.5 s en el cambio. | «Marque quién llegó y quién fue atendida. El día se ordena solo.» |
| 06 | 34.0 – 41.0 | `/resumen` | Zoom a la tira de cifras. Baja a la gráfica de llamadas por día. | «El informe dice cuántas llamadas entraron, cuántas se resolvieron solas y cuánto duraron.» |
| 07 | 41.0 – 47.5 | `/clientes/…` | Ficha de una persona: qué ha pasado, sus citas, notas del equipo. | «Cada persona tiene su ficha: sus citas, sus recados y lo que el equipo debe saber.» |
| 08 | 47.5 – 55.0 | `/agente` | «Listo para contestar 5/5», el saludo editable y el número al que transfiere. | «Y usted decide cómo contesta: horarios, servicios, saludo y a dónde pasa lo que no resuelve.» |
| 09 | 55.0 – 60.0 | `/hoy` | Vuelve al tablero, zoom-out. Rótulo final sobre la vista. | «Dimia. Donde el dato decide.» |

## Rótulos en pantalla

Cuatro, máximo tres palabras, Archivo 600, con el cuadrado azul de remate. Entran 0.4 s
después del corte y salen 1.2 s más tarde.

| Shot | Rótulo |
|---|---|
| 02 | Mensajes |
| 04 | Agenda en firme |
| 06 | El informe |
| 09 | panel.dimia.mx |

## Reglas de movimiento

- Un acercamiento por plano, nunca dos. Entre 1.0 y 1.25 de escala.
- Pausa de 0.3 a 0.5 s antes de cada corte y en el momento clave: la insignia «agendó», el
  cambio de estado de la cita, la cifra de resueltas sin humano.
- Cero scroll libre. Cada desplazamiento va a un ancla y se detiene.
- Cortes limpios entre secciones. Sin disolvencias.
- El cursor va en línea recta y se detiene antes de cada clic.

## Lo que se deja fuera

- **El sitio `dimia.mx`.** Este video es de la app.
- **Pedidos, cobros, campañas y recados.** Existen, pero sólo entran si la cuenta que me
  pase los trae con movimiento. Vacíos, restan.
- **Nombres y teléfonos de clientes reales.** Si la cuenta de producción trae personas de
  verdad, hay que decidir antes de grabar: o se usa un negocio de demostración, o tapo los
  datos en el editor. Un video se reenvía por WhatsApp; no es lo mismo que una pantalla
  que sólo ve el dueño.

## El nombre del producto

Su instrucción dice que el insignia se llama **Línea**, y `negocio/contexto-planes.md` lo
respalda. El sitio en producción dice «Agente de voz Dimia» y la app se presenta como
«Dimia Panel». El guion no usa ninguno de los tres como nombre propio: dice «el agente» y
«el panel», que es lo que se lee en pantalla. Cuando cierre el nombre, se ajusta en un
minuto.
