# Guion de demo · 3 minutos

Para enseñarlo en una junta, con el prospecto frente a la pantalla.
Abre `http://127.0.0.1:8800` antes de entrar a la junta y deja la ventana lista.

**Antes de empezar:** dale a *vaciar* en la agenda del negocio que vas a usar.
Que la agenda arranque limpia es la mitad del efecto.

**Regla de oro:** no expliques la arquitectura. Deja que la pantalla la enseñe.
Tú solo narras lo que va pasando en el panel derecho.

---

## 0:00 — 0:20 · El encuadre

> "Voy a llamarle al negocio y tú ves lo que pasa por dentro. No es un video,
> es el sistema corriendo. Del lado derecho vas a ver lo que hace mientras habla."

Elige el negocio más parecido al del prospecto y haz clic en él.

**Señala:** la ficha con los servicios y precios que aparece abajo.

> "Esto salió de la base de datos hace un segundo. Dar de alta tu negocio es
> llenar estas filas, no programar nada."

*(Si el prospecto es técnico, abre "ver el prompt que se le arma": el prompt
se ensambla en runtime con SUS servicios, SUS precios y SUS preguntas
frecuentes. Nada está escrito a la medida de nadie.)*

---

## 0:20 — 1:10 · La reserva

Clic en **Tomar la llamada**. Deja que salude. Luego habla tú, normal:

> **Tú:** "Hola, quiero una cita para una limpieza mañana."
> *(restaurante: "Quiero una mesa para cuatro personas mañana en la noche.")*

**Señala el panel derecho** en cuanto aparezca la primera tarjeta:

> "Ahí acaba de consultar la disponibilidad real. Ocho milisegundos.
> No está adivinando, le preguntó a la base."

> **Tú:** "La segunda me late. A nombre de <nombre del prospecto>."
> **Tú:** "Sí, apártala."

**Señala la agenda**, abajo a la derecha, cuando la reserva aterrice en verde:

> "Esa reserva ya está escrita en Postgres. Si abres tu agenda ahorita, está.
> Y ese código de cuatro letras se lo puede dictar por teléfono sin que se
> confunda: no usa letras que suenan igual."

**Si el prospecto pregunta "¿y si dos personas llaman al mismo tiempo?":**

> "No pueden chocar. La base tiene un constraint que hace físicamente
> imposible dos reservas encimadas en el mismo recurso. No es que el código
> revise bien: es que la base no lo deja. Eso Google Calendar no te lo da."

---

## 1:10 — 1:50 · No inventa

Este es el momento que decide la venta. Pregúntale algo que el negocio **no
tiene dado de alta**:

> **Tú:** "¿Cuánto cuesta el blanqueamiento?"
> *(restaurante: "¿Cuánto sale el menú de degustación?")*
> *(taller: "¿Cuánto me cobras por la transmisión?")*

El agente contesta que **no tiene ese dato** y ofrece pasarte con alguien.

> "Esta es la parte que a mí me quitaba el sueño. Si el precio no está en la
> base, no existe: no se lo inventa. Un asistente que cotiza de más te cuesta
> el cliente, y uno que cotiza de menos te cuesta el trabajo."

Luego pregunta uno que **sí** está dado de alta:

> **Tú:** "¿Y una limpieza?"

Contesta el precio exacto, el de la ficha.

> "Ese salió de la tabla de servicios. Tú lo cambias, y al siguiente segundo
> lo dice distinto. Sin tocarme a mí."

---

## 1:50 — 2:30 · Escala a un humano

Ahora el otro escenario que todo dueño teme:

> **Tú:** "Oye, una cosa: mi hija es alérgica a los mariscos, ¿el arroz lleva?"
> *(consultorio: "Soy alérgico a la penicilina, ¿me pueden atender?")*

El agente **no contesta la pregunta**. Llama a `transferir_a_humano` y la
transcripción marca el escalamiento en rojo.

**Señala la tarjeta roja en el panel:**

> "Aquí no intentó ayudar, y eso es lo correcto. Alergias, urgencias, quejas
> y todo lo que suene delicado se va con una persona, siempre. En producción
> esto transfiere la llamada real al celular que tú nos des."

---

## 2:30 — 3:00 · El cierre

Cambia de negocio con un clic — elige otro vertical — y deja que salude.

> "Es el mismo sistema. Lo único que cambió fueron las filas de la base.
> Tú no eres un proyecto de dos meses: es dar de alta tus servicios, tus
> horarios y tus preguntas frecuentes, y ya estás contestando."

Señala la métrica de latencia:

> "Y esto es lo que lo hace sonar a persona y no a robot: el hueco entre
> turnos. Ahí es donde se juega."

**Cierre:**

> "¿Quieres que lo dejemos contestando tu número una semana y comparamos
> cuántas llamadas se te van hoy sin contestar?"

---

## Contingencias

| Si pasa esto | Haces esto |
|---|---|
| El navegador no oye el micrófono | Teclea en el campo de abajo. La demo sigue igual: el panel es lo que importa. |
| El agente se traba o no entiende | "Cuelga" y vuelve a tomar la llamada. Los datos se quedan. |
| La agenda tiene basura de la demo anterior | *vaciar*, arriba de la agenda. |
| Preguntan "¿esto es el producto real?" | Abre `ver el prompt`. Es el mismo módulo que corre en producción. |
| El badge dice **Modo sin llaves** y preguntan | Di la verdad: el motor, la base y las herramientas son las de producción; la voz y el modelo son locales para poder enseñarlo sin gastar. Con las llaves puestas es el stack completo. |

## Lo que NO debes decir

- No prometas latencias específicas: el modo sin llaves mide milisegundos
  porque el cerebro es local. En producción el presupuesto es 700–900 ms.
- No digas que ya hay clientes si no los hay.
- No enseñes el modo sin llaves como si fuera el stack de voz final.
