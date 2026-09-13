# Anuncio de lanzamiento · Meta Ads

Reel vertical de 30 segundos para Instagram y Facebook. 1080 × 1920, 30 fps.
Nadie da la cara: lugares cerrados, objetos y manos. Cuatro giros en el gancho.

## Reparto del trabajo

Los modelos de video deshacen el texto, las interfaces y los logotipos. Por eso el anuncio se
parte en dos capas y cada una se hace donde sale bien:

| Capa | Herramienta | Qué hace |
|---|---|---|
| Planos cinemáticos | Higgsfield · GPT Image 2.5 → Kling 3.0 Pro | Ambiente, luz, objetos, manos. Nada legible. |
| Marca y dato | Remotion (`../video-panel`) | Rótulos, panel real, logotipo, animación de cierre. |
| Voz | ElevenLabs, ajustes de `../demo-plataforma/demo-voiceover-elevenlabs.md` | Locución en usted. |

## Ruta de créditos

1. **Cuadro fijo primero.** Cada plano nace como imagen en GPT Image 2.5 (3 créditos en
   calidad alta). Se corrige la imagen, no el video; los retoques chicos van por Nano Banana
   Pro (2 créditos) para no perder el encuadre.
2. **Kling 3.0 Pro directo.** Con el cuadro aprobado como imagen inicial: 5 s, 1080 × 1912,
   con sonido, por 12.5 créditos. Son planos de un solo plano de acción y cámara casi fija,
   justo lo que Kling resuelve bien. Seedance 2.5 cuesta 36 créditos por 4 s a 1080p, así que
   no hace falta una pasada de prueba a baja resolución.
3. **Seedance 2.5 solo de rescate.** Si un plano con física difícil (la cortina, los guantes)
   sale mal en Kling, se repite en Seedance a 1080p.

| Partida | Cantidad | Créditos |
|---|---|---|
| Cuadros fijos | 6 + 2 correcciones | 23 |
| Kling 3.0 Pro 5 s | 6 | 75 |
| Rescate en Seedance 2.5 | hasta 2 | ≈ 72 |
| Margen de repetición | — | ≈ 30 |
| **Total** | | **≈ 200** |

Prueba hecha: `tomas/03-kling.json` — la mano deja las tijeras, sale de cuadro y el
teléfono vibra. Coherente, sin deformaciones.

## Guion

Zonas seguras de Reels: 14 % superior y 35 % inferior sin texto ni acción clave
(la interfaz de Meta tapa ahí el nombre, la copia y el botón).

| Tiempo | Plano | Fuente | Rótulo | Voz |
|---|---|---|---|---|
| 0.0 – 2.5 | **01 Restaurante.** Teléfono boca abajo vibra sobre la barra, sillas arriba. | Seedance | `20:41` | Ocho cuarenta de la noche. |
| 2.5 – 4.5 | **02 Consultorio.** Manos se quitan los guantes; el teléfono de recepción parpadea. | Seedance | | Su negocio ya cerró. |
| 4.5 – 6.5 | **03 Salón.** Manos dejan las tijeras junto a un teléfono que vibra. | Seedance | | El teléfono, no. |
| 6.5 – 8.5 | **04 Despacho.** Una mano apaga la lámpara; el teléfono sigue vibrando. | Seedance | Nadie alcanza a contestar | Cada llamada sin contestar es una venta que se va. |
| 8.5 – 9.0 | Silencio. El timbre se corta. | Corte seco | | |
| 9.0 – 17.0 | Panel real: *En llamada 00:42* → *Confirmada*. | Remotion | Contesta. Entiende. Agenda. | Dimia contesta al primer timbre, entiende y agenda. |
| 17.0 – 22.0 | **05 Amanecer.** Manos suben la cortina del restaurante. | Seedance | La cita quedó escrita antes de colgar | La cita queda escrita antes de colgar. |
| 22.0 – 26.0 | **06 Mesa.** Teléfono boca arriba junto al café; pantalla reemplazada por la agenda. | Seedance + Remotion | | Usted abre, y la agenda ya está al día. |
| 26.0 – 30.0 | Cierre: las astas entran, los puntos caen 200 ms después. | Remotion | dimia.mx · Agendar demostración | Dimia. Donde el dato decide. |

El timbre corre continuo por encima de los cuatro cortes del gancho: es lo que amarra los
giros en un solo problema.

**Botón de Meta:** «Reservar» apuntando a `dimia.mx`.
**Copia del anuncio:** `[ copia por confirmar ]`.

## Plano 06 · pantalla reemplazable

El teléfono va sobre la mesa, cámara fija, pantalla en negro plano. Así las esquinas no se
mueven y la agenda real se pega en Remotion sin seguimiento de cámara.

## Estilo de todos los cuadros

- La paleta entra por la luz, no por pintura: sombras en tinta azul-negro `#0b0f17`, luz
  ambiental acero frío, una sola lámpara cálida color latón `#c8a45c`.
- 35 mm, poca profundidad de campo, grano de película, sin cámara lenta.
- Ninguna cara. Ninguna pantalla con contenido. Ningún texto ni logotipo generado.
- Fuera: brillo azul, partículas, hologramas, destellos de lente, gradación teal y naranja.

Los prompts exactos viven en [`cuadros.sh`](cuadros.sh).

## Antes de publicar

- [ ] Cero cifras inventadas; lo que se lea en el panel sale de la captura con rótulo
      `Datos de demostración`
- [ ] Logotipo desde `marca/logotipo`, nunca generado
- [ ] Ningún rostro, ninguna esquina redondeada en gráficos, ninguna sombra
- [ ] Texto fuera del 14 % superior y el 35 % inferior
- [ ] Cortes secos, sin disolvencias
