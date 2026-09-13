# Spot · La torre no cierra

Anuncio principal de Dimia, hecho como lo haría una productora: corto, un solo plano
secuencia, acabado de cine. Vertical 1080 × 1920, 15 s de imagen + 3 s de cierre de marca.
Un grupo inmobiliario de desarrollos residenciales en Santa Fe, Ciudad de México.
Personas trabajando, nadie le habla a cámara.

Parte de lo aprendido en [`../anuncio-lanzamiento`](../anuncio-lanzamiento): registro
realista, paleta por la luz, efectos solo dentro de la marca.

## La idea

Una llamada entra cuando la oficina ya cerró. La cámara no corta: deja el teléfono,
pasa junto a la maqueta de la torre, la ciudad amanece detrás del ventanal y a la mañana
siguiente la visita que agendó Dimia ya está llegando.

La continuidad es el argumento: nada se detuvo en la noche.

## Modelo

**Cinema Studio 4.0** (`cinematic_studio_video_4_0`), lo más alto de Higgsfield para
cine. Una sola generación de 15 s, con cuadro inicial y cuadro final para amarrar el
arranque y el remate. Mismo precio que Seedance 2.5.

| Paso | Qué | Créditos |
|---|---|---|
| 1 | Hoja de la ejecutiva (Nano Banana Pro) | 2 |
| 2 | Cuadro inicial K0 y cuadro final K1 con la misma ejecutiva | ≈ 6 |
| 3 | **Previa a 480p** para validar movimiento y ritmo | 37.5 |
| 4 | **Final a 1080p**, solo si la previa convence | 135 |
| 5 | Montaje, rótulos, voz y cierre en Remotion | 0 |
| | **Total** | **≈ 180** |

La previa es el animatic: si el movimiento no funciona se corrige el prompt a 37.5 y no
a 135.

## Plano

| Tiempo | Qué pasa |
|---|---|
| 0 – 4 | **K0 · Lobby, noche.** Travertino, doble altura. En primer plano el teléfono de recepción se enciende y suena. Al fondo la ejecutiva, traje azul marino, apaga la luz de la maqueta y camina al elevador. |
| 4 – 9 | La cámara se despega del teléfono y sube despacio junto a la maqueta iluminada. Detrás del ventanal la noche de Santa Fe se vuelve amanecer sin corte. |
| 9 – 15 | **K1 · Lobby, mañana.** Luz de día. La misma ejecutiva recibe a una pareja junto a la maqueta, les muestra la visita en la tableta, se dan la mano. La cámara se asienta. |
| 15 – 18 | Cierre en Remotion: logotipo animado, «Donde el dato decide», `dimia.mx`. |

**Cámara:** cuerpo de cine digital, anamórfico 40 mm, grúa lenta y continua, sin cortes.
**Luz:** noche con prácticos cálidos tenues y ciudad fría; mañana suave de ventanal.
**Color:** sombras azul tinta, un solo acento cálido latón, desaturado.

## Rótulos

Sobrios, fuera del 14 % superior y el 35 % inferior:

| Momento | Rótulo |
|---|---|
| 0 – 4 | `20:14` · cuadrado azul latiendo · `Llamada entrante` |
| 5 – 9 | `En llamada` → `Visita agendada · Sáb 10:00` |
| 10 – 15 | `09:58` · cuadrado verde · `Visita confirmada` |

Datos de demostración.

## Locución

Misma voz y ajustes de ElevenLabs que el primer anuncio.

```
Ocho y cuarto. La oficina ya cerró.

Dimia contesta, entiende y agenda la visita.

A la mañana siguiente, la cita ya está ahí.

Dimia. Donde el dato decide.
```

## Riesgos

- **La cara de la ejecutiva cambia** entre noche y mañana. Por eso va la hoja de personaje
  como referencia y el cuadro final fijo.
- **El amanecer detrás del ventanal** puede deformar la maqueta. Si pasa en la previa, se
  quita el paso del tiempo del plano y el cambio de noche a día se resuelve con el cuadrado
  de la marca en Remotion.
- **Cámara y lente** van descritos en el prompt: la CLI no expone el catálogo de presets de
  cámara de Cinema Studio.

## Antes de publicar

- [ ] Personas generadas: ninguna se parece a alguien real ni a un cliente
- [ ] Cero cifras inventadas; lo que se lee dice `Datos de demostración`
- [ ] Logotipo desde `marca/logotipo`
- [ ] Texto fuera del 14 % superior y el 35 % inferior
- [ ] Ningún glow, neón, partícula ni rebote
