# Guion de voz · ElevenLabs

- **Idioma:** español de México
- **Duración objetivo:** 60 s · 118 palabras · 2.0 palabras por segundo
- **Registro:** calmado y seguro. Afirma, no vende. Se lee como quien enseña su propia
  herramienta, no como locutor de radio.
- **Qué narra:** la app. El sitio no aparece en ningún plano.

---

## 1 · Instrucciones de ElevenLabs

| Ajuste | Valor | Por qué |
|---|---|---|
| **Modelo** | Eleven Multilingual v2 | Es el que trae la fonética mexicana sin acento neutro de doblaje. |
| **Voz** | Masculina o neutra profesional, español latino. Sirve la misma «Hope» que ya usó en el video del panel, si quiere que las dos piezas suenen a la misma casa. | Continuidad de marca entre piezas. |
| **Stability** | 55 | Alta, pero no plana. Abajo de 45 la voz se pone dramática en los remates; arriba de 70 se muere. |
| **Similarity** | 80 | Suficiente para que no derive de timbre entre párrafos. |
| **Style exaggeration** | 10 | Casi nada. El énfasis lo pone la escritura, no el motor. |
| **Speaker boost** | Encendido | |
| **Velocidad** | −5 % | Deja aire para las pausas del corte. |
| **Formato de salida** | MP3 44.1 kHz / 192 kbps | Es lo que espera `audio.sh`. |

**Cómo pegarlo:** un salto de línea doble entre párrafos. Cada párrafo es un shot; ese
salto es la pausa que después se usa para cortar y repartir en la línea de tiempo. No le
ponga marcas de tiempo ni acotaciones al texto: ElevenLabs las lee.

---

## 2 · Guion limpio · copiar y pegar

```
Este es el panel de Dimia. Aquí llega todo lo que el agente contestó por usted.

En Mensajes está cada conversación que entró, por teléfono y por WhatsApp.

Ábrala y lea qué le preguntaron, qué respondió el agente y en qué terminó.

Lo que agendó ya está en la agenda, con su hora y su responsable.

Marque quién llegó y quién fue atendida. El día se ordena solo.

El informe dice cuántas llamadas entraron, cuántas se resolvieron solas y cuánto duraron.

Cada persona tiene su ficha: sus citas, sus recados y lo que el equipo debe saber.

Y usted decide cómo contesta: horarios, servicios, saludo y a dónde pasa lo que no resuelve.

Dimia. Donde el dato decide.
```

---

## 3 · Guion con tiempos, contra el shot list

| Shot | Segundos | Qué se ve | Texto |
|---|---|---|---|
| 01 | 0.0 – 6.5 | `/hoy`, el tablero del día | Este es el panel de Dimia. Aquí llega todo lo que el agente contestó por usted. |
| 02 | 6.5 – 13.0 | `/bandeja`, la lista con sus etiquetas | En Mensajes está cada conversación que entró, por teléfono y por WhatsApp. |
| 03 | 13.0 – 20.5 | La conversación abierta, insignia «agendó» | Ábrala y lea qué le preguntaron, qué respondió el agente y en qué terminó. |
| 04 | 20.5 – 27.5 | `/agenda`, el día con sus citas | Lo que agendó ya está en la agenda, con su hora y su responsable. |
| 05 | 27.5 – 34.0 | La cita cambia de «Por llegar» a «En atención» | Marque quién llegó y quién fue atendida. El día se ordena solo. |
| 06 | 34.0 – 41.0 | `/resumen`, cifras y gráfica por día | El informe dice cuántas llamadas entraron, cuántas se resolvieron solas y cuánto duraron. |
| 07 | 41.0 – 47.5 | Ficha de una persona | Cada persona tiene su ficha: sus citas, sus recados y lo que el equipo debe saber. |
| 08 | 47.5 – 55.0 | `/agente`, «Listo para contestar 5/5» | Y usted decide cómo contesta: horarios, servicios, saludo y a dónde pasa lo que no resuelve. |
| 09 | 55.0 – 60.0 | Vuelta al tablero | Dimia. Donde el dato decide. |

Los tiempos son de imagen. La voz de cada plano entra medio segundo después del corte;
ese margen se afina cuando llegue el MP3, midiendo las pausas reales con `silencedetect`.

---

## 4 · Takes opcionales

### Take corto · 38 s · 71 palabras

Para historia o para abrir un correo. Sólo la cadena que importa: entró, quedó agendado,
quedó medido.

```
Este es el panel de Dimia.

Cada conversación que entró queda escrita: qué preguntaron y en qué terminó.

Lo que agendó ya está en la agenda, con su hora y su responsable.

Y el informe dice cuántas llamadas entraron y cuántas se resolvieron solas.

Dimia. Donde el dato decide.
```

### Take comercial · 70 s · 141 palabras

Para una reunión, donde el dueño necesita entender qué compra.

```
Su negocio recibe llamadas a toda hora. Las que no alcanza a contestar son ventas perdidas.

Este es el panel de Dimia. Aquí llega todo lo que el agente contestó por usted.

En Mensajes está cada conversación que entró, por teléfono y por WhatsApp. Ábrala y lea qué le preguntaron, qué respondió el agente y en qué terminó.

Lo que agendó ya está en la agenda, con su hora y su responsable. Marque quién llegó y quién fue atendida: el día se ordena solo.

El informe dice cuántas llamadas entraron, cuántas se resolvieron solas y cuánto duraron.

Cada persona tiene su ficha, con sus citas y lo que el equipo debe saber.

Y usted decide cómo contesta: horarios, servicios, saludo y a dónde pasa lo que no resuelve.

Dimia. Donde el dato decide.
```

## 5 · Lo que el guion no dice, a propósito

- **Ninguna cifra.** Las únicas que aparecen salen del informe en pantalla. La voz no las
  repite, para que nadie las cite como resultado comprometido.
- **Ningún nombre de persona.** Si la cuenta de producción trae clientes reales, hay que
  decidir antes de grabar: negocio de demostración, o taparlos en el editor.
- **Ninguna palabra de la lista negra.** Sin «revolucionario», «solución 360», «impulsado
  por IA», «partner estratégico», «sinergia», «disruptivo», «ecosistema» ni «potenciar».
  Tampoco «transformación digital» como eslogan.
- **No dice «Línea» ni «Agente de voz Dimia».** Dice «el agente» y «el panel», que es lo
  que se lee en pantalla. El desacuerdo de nombre está explicado al final del shot list.
