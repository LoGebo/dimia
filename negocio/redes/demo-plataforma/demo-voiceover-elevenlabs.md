# Guion de voz · ElevenLabs

- **Idioma:** español de México
- **Duración objetivo:** 65 s · 119 palabras · 1.8 palabras por segundo
- **Registro:** calmado y seguro. Afirma, no vende. Se lee como quien enseña su propia
  herramienta, no como locutor de radio.

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
Dimia es la plataforma que convierte cada conversación con sus clientes en una acción.

Empieza con el agente de voz: un número que contesta las veinticuatro horas.

Entiende lo que le piden, consulta la agenda y aparta el lugar antes de colgar.

La disponibilidad la decide la base, no la conversación. Dos citas encimadas son imposibles.

Todo lo que atendió llega al panel.

Cada conversación queda escrita: qué le preguntaron, qué respondió y en qué terminó.

La cita ya está en la agenda, con su hora y su responsable.

El informe dice cuántas llamadas entraron y cuántas se resolvieron solas.

Horarios, servicios y saludo los define usted, desde el mismo panel.

Marque el número y escúchelo contestar. Dimia. Donde el dato decide.
```

---

## 3 · Guion con tiempos, contra el shot list

| Shot | Segundos | Qué se ve | Texto |
|---|---|---|---|
| 01 | 0.0 – 5.5 | Hero de `dimia.mx` | Dimia es la plataforma que convierte cada conversación con sus clientes en una acción. |
| 02 | 5.5 – 11.5 | Ficha «Agente de voz Dimia» | Empieza con el agente de voz: un número que contesta las veinticuatro horas. |
| 03 | 11.5 – 18.5 | Widget «Línea principal» corriendo | Entiende lo que le piden, consulta la agenda y aparta el lugar antes de colgar. |
| 04 | 18.5 – 26.0 | Colisión de horarios, la reserva rechazada | La disponibilidad la decide la base, no la conversación. Dos citas encimadas son imposibles. |
| 05 | 26.0 – 32.0 | Panel `/hoy` | Todo lo que atendió llega al panel. |
| 06 | 32.0 – 40.0 | Conversación de Jorge Estrada | Cada conversación queda escrita: qué le preguntaron, qué respondió y en qué terminó. |
| 07 | 40.0 – 47.0 | Agenda del día, cuatro citas | La cita ya está en la agenda, con su hora y su responsable. |
| 08 | 47.0 – 54.0 | Informe, tira de cifras | El informe dice cuántas llamadas entraron y cuántas se resolvieron solas. |
| 09 | 54.0 – 59.5 | `/agente`, «Listo para contestar» | Horarios, servicios y saludo los define usted, desde el mismo panel. |
| 10 | 59.5 – 65.0 | Teléfono y cierre | Marque el número y escúchelo contestar. Dimia. Donde el dato decide. |

Los tiempos son de imagen. La voz de cada shot entra medio segundo después del corte y
termina antes del siguiente; ese margen se ajusta solo cuando llegue el MP3, midiendo las
pausas reales con `silencedetect`, igual que en el video del panel.

---

## 4 · Takes opcionales

### Take corto · 40 s · 74 palabras

Para historia de Instagram o para abrir un correo en frío. Salta el sitio y va directo al
producto.

```
Un número que contesta las veinticuatro horas.

Entiende lo que le piden, consulta la agenda y aparta el lugar antes de colgar.

La disponibilidad la decide la base. Dos citas encimadas son imposibles.

Cada conversación queda escrita, y la cita ya está en la agenda.

El informe dice cuántas llamadas entraron y cuántas se resolvieron solas.

Dimia. Donde el dato decide.
```

### Take comercial · 70 s · 143 palabras

Para una reunión o una propuesta, donde el dueño necesita entender qué compra.

```
Su negocio recibe llamadas a toda hora. Las que no alcanza a contestar son ventas perdidas.

Dimia es la plataforma que convierte cada conversación con sus clientes en una acción.

Empieza con el agente de voz: un número que contesta las veinticuatro horas.

Entiende lo que le piden, consulta la agenda y aparta el lugar antes de colgar.

La disponibilidad la decide la base, no la conversación. Dos citas encimadas son imposibles, entren cinco llamadas o quinientas.

Todo lo que atendió llega al panel. Cada conversación queda escrita: qué le preguntaron, qué respondió y en qué terminó.

La cita ya está en la agenda, con su hora y su responsable. Y el informe dice cuántas llamadas entraron y cuántas se resolvieron solas.

Horarios, servicios y saludo los define usted.

Marque el número y escúchelo contestar. Dimia. Donde el dato decide.
```

---

## 5 · Lo que el guion no dice, a propósito

- **Ninguna cifra.** Las únicas que aparecen salen del informe en pantalla, y son datos de
  demostración: el video las rotula como tales. La voz no las repite para que nadie las
  cite como resultado de un cliente.
- **Ningún cliente por nombre.** Ver la nota del shot list sobre los logotipos.
- **Ninguna palabra de la lista negra.** Sin «revolucionario», «solución 360», «impulsado
  por IA», «partner estratégico», «sinergia», «disruptivo», «ecosistema» ni «potenciar».
  Tampoco «transformación digital» como eslogan.
- **No dice «Línea».** El sitio en producción llama al producto «Agente de voz Dimia»;
  narrar otro nombre sobre esa pantalla se nota. El desacuerdo está explicado al final del
  shot list y se resuelve en un minuto una vez que usted decida cuál es el nombre bueno.
