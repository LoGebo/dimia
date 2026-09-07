# Demo de la plataforma · shot list

Recorrido de **65 segundos** por lo que Dimia ya tiene en línea: el sitio y el panel del
agente de voz. Todo lo que aparece existe hoy; no hay pantalla de relleno ni maqueta.

## Lo que se grabó y de dónde sale

| Superficie | URL | Acceso |
|---|---|---|
| Sitio público | `https://dimia.mx` | abierto |
| Panel del agente | `http://localhost:3111` | `dueno@demo.mx` / `demo1234` |

El panel corre en local contra Postgres `dimia_local`, con los datos de demostración que
siembra `proyectos/voz/web/dev/seed_panel.sql`. El negocio activo es la Clínica Dental
Sonrisa —cookie `agenda_negocio` = `bca5d234-9549-4700-8590-1dbe02af4053`—, la única que
tiene agenda con citas. No hay staging público del panel; si lo hubiera, se cambia una
variable y se vuelve a grabar.

## Shot list

| # | Segundos | Pantalla | Acción | Voz en ese beat |
|---|---|---|---|---|
| 01 | 0.0 – 5.5 | `dimia.mx` `#inicio` | Entra el hero. Acercamiento lento al lettering. | «Dimia es la plataforma que convierte cada conversación con sus clientes en una acción.» |
| 02 | 5.5 – 11.5 | `dimia.mx` `#productos` | Baja a Productos. Zoom a «Agente de voz Dimia» y a la ficha: qué resuelve, para quién, integra con. | «Empieza con el agente de voz: un número que contesta las veinticuatro horas.» |
| 03 | 11.5 – 18.5 | `dimia.mx` widget «Línea principal» | Corre la secuencia de demostración del sitio: el contador arranca y avanzan los pasos de la llamada. | «Entiende lo que le piden, consulta la agenda y aparta el lugar antes de colgar.» |
| 04 | 18.5 – 26.0 | `dimia.mx` `#garantia` | La animación de la colisión: 17:00–17:30 confirmada, 17:15–17:45 rechazada por la base, se ofrece 17:45. Pausa de 0.5 s en el rechazo. | «La disponibilidad la decide la base, no la conversación. Dos citas encimadas son imposibles.» |
| 05 | 26.0 – 32.0 | Panel `/hoy` | Corte al panel ya con sesión. Zoom-out del tablero completo, luego acercamiento a la gráfica de la quincena. | «Todo lo que atendió llega al panel.» |
| 06 | 32.0 – 40.0 | Panel `/bandeja` | Clic en la conversación de Jorge Estrada. Zoom al hilo: «quiero agendar una limpieza» → «queda apartada, su código es B68E». Pausa de 0.4 s en la insignia «agendó». | «Cada conversación queda escrita: qué le preguntaron, qué respondió y en qué terminó.» |
| 07 | 40.0 – 47.0 | Panel `/agenda` | El día hábil con cuatro citas. Zoom a la columna «Por llegar» y a la primera ficha con hora y responsable. | «La cita ya está en la agenda, con su hora y su responsable.» |
| 08 | 47.0 – 54.0 | Panel `/resumen` | Zoom a la tira de cifras: llamadas, resueltas sin humano, escalamiento, duración. Baja a la gráfica por día. | «El informe dice cuántas llamadas entraron y cuántas se resolvieron solas.» |
| 09 | 54.0 – 59.5 | Panel `/agente` | «Listo para contestar 5/5» y el cuadro «Cómo contesta» con el saludo editable. | «Horarios, servicios y saludo los define usted, desde el mismo panel.» |
| 10 | 59.5 – 65.0 | `dimia.mx` `#contacto` | Vuelve al sitio. Zoom al teléfono +52 81 1518 8129 y al botón «Agendar una demostración». Cierra en el lockup. | «Marque el número y escúchelo contestar. Dimia. Donde el dato decide.» |

## Rótulos en pantalla

Cuatro, máximo cuatro palabras, Archivo 600 sobre tinta, con el cuadrado azul de remate.
Entran a los 0.4 s del corte y salen 1.2 s después.

| Shot | Rótulo |
|---|---|
| 02 | Agente de voz |
| 05 | El panel |
| 07 | Agenda en firme |
| 10 | dimia.mx |

## Reglas de movimiento

- Acercamientos deliberados: uno por shot, nunca dos. Entre 1.0 y 1.25 de escala.
- Pausa de 0.3 a 0.5 s antes de cada corte y en el momento clave del shot (el rechazo de
  la colisión, la insignia «agendó», la cifra de resueltas sin humano).
- Cero scroll libre. Cada desplazamiento va a un ancla concreta y se detiene.
- Cortes limpios entre secciones. Sin disolvencias, sin barridos.
- El cursor se mueve en línea recta y se detiene antes de cada clic.

## Lo que se dejó fuera, y por qué

- **«Confían en Dimia» (Atos, Heineken, Arca Continental, Tec de Monterrey, UERRE).**
  Está en el sitio, pero un video se reenvía por WhatsApp y se sube a redes: es una
  distribución distinta a la de una página. `README.md` de la firma tiene pendiente
  «definir qué clientes tienen autorización escrita para aparecer con nombre». Si esa
  autorización ya existe, se agrega un shot de 3 s entre el 04 y el 05 y el video sube a
  68 s. Dígamelo y lo meto.
- **Planes y precios.** Ocupan 1900 px de sitio y meterlos obliga a leer una tabla; en un
  video de un minuto no se alcanzan a leer y ensucian el ritmo. El CTA del shot 10 lleva
  ahí.
- **Pedidos, recados, cobros y campañas.** Existen en el panel, pero con los datos de
  demostración actuales salen en cero y se ven vacíos. Se pueden sembrar y agregar.

## Un desacuerdo de nombre que hay que resolver

Su instrucción dice que el producto insignia se llama **Línea**. El repo lo respalda:
`negocio/contexto-planes.md` dice «Dimia Línea». Pero **el sitio en producción no usa ese
nombre**: la sección Productos dice «Agente de voz Dimia», y «Línea principal» aparece
solo como el rótulo del widget de demostración.

El guion narra lo que se ve —«el agente de voz»— porque narrar «Línea» sobre una pantalla
que dice otra cosa se nota. Si Línea es el nombre bueno, hay que cambiarlo primero en el
sitio y volver a grabar; si el nombre bueno es «Agente de voz Dimia», hay que corregir
`contexto-planes.md`. Es decisión suya; el guion se ajusta en un minuto en cualquiera de
los dos sentidos.
