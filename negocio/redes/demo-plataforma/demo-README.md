# Cómo se hace este demo

Grabación de la app `panel.dimia.mx`, manejada por script de punta a punta. Recordly graba
y edita; el recorrido dentro de la ventana lo mueve Node por el protocolo de Chrome, así
que la toma sale idéntica cada vez y se puede repetir cuando cambie el panel.

## Lo que hace falta

| Pieza | Estado |
|---|---|
| Recordly 1.3.3 | Instalado en `/Applications`. SHA256 verificado contra la release `v1.3.3` de `webadderall/Recordly`. Firmado, `dev.recordly.app`, Team `54QUWA9PZA`. |
| Permiso de grabación de pantalla | Concedido a Recordly en Ajustes del Sistema. |
| Cuenta de `panel.dimia.mx` | **Pendiente.** Va por variable de entorno. |
| Node | 22 o más. `puppeteer-core` es la única dependencia. |

## Correrlo

Tres terminales, o tres comandos en fondo:

```bash
# 1 · ventana limpia sobre la app (perfil nuevo, sin pestañas ni barra de direcciones)
node tour.mjs &

# 2 · Recordly con su protocolo abierto, para manejarlo desde aquí
open -a /Applications/Recordly.app --args --remote-debugging-port=9444

# 3 · el recorrido
PANEL_USUARIO='...' PANEL_CLAVE='...' PANEL_NEGOCIO='<uuid del negocio>' node recorrido.mjs
```

Entre el 2 y el 3 se le dice a Recordly qué grabar y que arranque. Todo por el mismo
protocolo, en el puerto 9444:

| Paso | Qué se hace |
|---|---|
| Fuente | Se elige el elemento de la lista cuyo texto sea el título de la ventana de la demo. Nunca «Screen 1»: eso graba el escritorio entero. |
| Micrófono y webcam | Apagados. La voz va aparte, desde ElevenLabs. |
| Grabar | El botón con `title="Record"`. El HUD pasa a mostrar `REC 00:00`. |
| Ocultar HUD | El botón `Hide HUD`, para que la barra no estorbe. |
| Detener | El botón `Stop`. Al detener abre solo el editor con la toma. |

## Exportar

El editor es otra ventana del mismo proceso, así que se maneja igual. Trae presets,
velocidad de clip, recorte, capas y el botón **Export**. El auto-zoom lo propone Recordly
a partir del cursor; por eso el recorrido mueve el cursor en línea recta y lo detiene
antes de cada clic, para que las regiones de acercamiento caigan donde deben.

Salida: MP4 1080p, 30 fps, sin marca de agua.

## Pegarle la voz

1. El texto está en [`demo-voiceover-elevenlabs.md`](demo-voiceover-elevenlabs.md), con los
   ajustes de voz. Se pega el bloque limpio, se genera y se baja el MP3.
2. El montaje ya está resuelto en el video del panel, en
   [`../video-panel/audio.sh`](../video-panel/audio.sh): parte la locución en sus párrafos
   —cortando a la mitad de cada pausa, medidas con `silencedetect`— y coloca cada uno en el
   segundo que le toca según el shot list.
3. Si prefiere hacerlo a mano: en la línea de tiempo de Recordly, `Add Layer` acepta audio.
   En CapCut o DaVinci, la pista de voz va sobre el video y se alinea con la tabla de
   tiempos del guion.

## Repetirlo cuando cambie el panel

El recorrido no depende de coordenadas fijas del panel: busca los elementos por su texto
—la conversación de la bandeja, el botón «Llegó», la ficha del cliente— y avanza días hasta
encontrar uno con citas. Si el panel cambia de estructura, lo que se rompe es un selector,
no la toma entera.

## Cuidados

- **Nunca grabar «Screen 1».** El escritorio suele tener correo, terminales y
  conversaciones a la vista. Siempre la ventana de la demo.
- **Datos de personas.** Si la cuenta de producción trae clientes reales, decidirlo antes
  de grabar: negocio de demostración, o taparlos en el editor. Un video se reenvía; una
  pantalla del panel no.
- **La cuenta no se escribe en el repo.** Va por `PANEL_USUARIO` y `PANEL_CLAVE`, como pide
  [`CONTRIBUIR.md`](../../../CONTRIBUIR.md).
