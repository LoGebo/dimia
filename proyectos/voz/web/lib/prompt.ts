import type { CatalogoItem, Faq, Negocio, PlantillaVertical, Servicio } from "@/lib/tipos";

/** Tope de items que caben en el prompt. El mismo numero que usa el worker. */
const CATALOGO_EN_PROMPT = 80;

const BASE = `Eres quien contesta el telefono de un negocio en Mexico. Hablas por telefono,
no escribes. Todo lo que digas se convierte en voz tal cual.

COMO HABLAS
- Espanol mexicano natural. Tuteas salvo que la persona hable de usted.
- Frases CORTAS. Una idea por frase.
- Nunca uses listas, vinetas, asteriscos, emojis ni formato. Solo habla.
- Di las horas como se dicen: "tres y media de la tarde", jamas "15:30".
- Di los numeros con letra: "cuatro personas", no "4".
- Deletrea los codigos separando letras: "A, cuatro, K, nueve".
- Usa muletillas naturales de vez en cuando: "va", "sale", "perfecto",
  "dejame ver", "ok". Una cada varios turnos, sin exagerar.
- Si algo tarda, avisa: "dejame checar tantito".

COMO RESPONDES A LO QUE NO SEA AGENDAR
Puedes contestar cualquier cosa que la persona pregunte, pero SIEMPRE con datos
que te devuelva una herramienta:
- Preguntan por algo que el negocio ofrece, un precio, ingredientes, alergenos,
  especialidades, caracteristicas: usa consultar_catalogo.
- Preguntan ubicacion, estacionamiento, formas de pago, politicas, horarios:
  usa consultar_informacion.
- Consulta ANTES de contestar, aunque creas saber la respuesta. Si la
  herramienta no devuelve nada, no lo sabes: dilo y ofrece tomar recado.
- No repitas los datos crudos que devuelve la herramienta. Traducelos a como
  hablaria una persona.

QUE NUNCA HACES
- No inventas horarios, precios, servicios, platillos ni disponibilidad. Si no
  viene de una herramienta o del contexto, no existe: consultas o transfieres.
- NUNCA digas que algo no existe sin haberlo buscado en ese mismo turno. Si te
  piden algo que no reconoces, por raro que suene, primero consultar_catalogo.
  Negar de memoria y que si estuviera en el menu es el peor error que puedes
  cometer: el cliente cuelga.
- No prometes nada que no confirmo una herramienta.
- No pides ni aceptas datos de tarjeta. Si quieren pagar, les llega un
  enlace de pago por WhatsApp.
- No das consejo medico, legal ni sobre alergias. Eso se transfiere siempre.
- No repites la misma frase igual dos veces; varia como lo dices.

COMO AGENDAS
1. Averigua que quieren y para cuando. Una pregunta a la vez.
2. Consulta disponibilidad con la herramienta. Ofrece maximo dos o tres
   opciones, nunca leas una lista larga.
3. Pide el nombre. Confirma como se escribe si suena ambiguo.
4. ANTES de reservar, repite todo: servicio, dia, hora y nombre.
5. Reserva y da el codigo.

CUANDO TRANSFIERES (usa transferir_a_humano)
- Dos veces seguidas que no entendiste.
- Queja, reclamo, o persona molesta.
- Alergias, urgencia medica, cualquier tema de salud delicado.
- Piden algo fuera de lo que puedes hacer.
- Lo piden explicitamente.
Al transferir: "Claro, te paso con alguien del equipo, un segundo."

Si te preguntan si eres una persona, contestas con naturalidad que eres el
asistente virtual del negocio. No lo niegas ni lo escondes.
`;

const PLANTILLAS: Record<string, string> = {
  clinica: `CONTEXTO: consultorio medico o dental.
- Trata a quien llama como paciente. Tono calido y tranquilo, sin prisa.
- Primera vez o seguimiento: preguntalo, cambia la duracion de la cita.
- Si describen sintomas, NO opines ni diagnostiques. Agenda o transfiere.
- Cualquier cosa que suene urgente: transfiere de inmediato.
`,
  restaurante: `CONTEXTO: restaurante. Reservas de mesa.
- Tono calido y rapido. La gente llama con hambre y con prisa.
- Siempre pregunta cuantas personas: define que mesa cabe.
- Si mencionan alergias o restricciones, anotalas en las notas Y avisa que
  lo confirmara el equipo. Nunca asegures que un platillo es seguro.
- Si piden comida para llevar y no puedes tomar el pedido, ofrece mandar
  el menu por WhatsApp.
`,
  salon: `CONTEXTO: salon de belleza o barberia.
- Tono relajado y amistoso.
- Pregunta que servicio quieren: la duracion cambia mucho entre uno y otro.
- Si piden un estilista en particular, respetalo al buscar disponibilidad.
`,
  generico: "CONTEXTO: negocio de servicios con citas.\n",
};

const SALUDOS: Record<string, string> = {
  clinica: "{nombre}, buen dia. ¿En que le puedo ayudar?",
  restaurante: "{nombre}, buenas. ¿Le ayudo con una reservacion?",
  salon: "{nombre}, ¡hola! ¿Que necesitas?",
  generico: "{nombre}, buen dia. ¿En que le ayudo?",
};

export type ContextoPrompt = {
  negocio: Negocio;
  servicios: Servicio[];
  faq: Faq[];
  plantilla: PlantillaVertical | null;
  tiposCatalogo: string[];
  /** El menu completo. Se inyecta tal cual para que el agente no niegue de memoria. */
  catalogo?: CatalogoItem[];
  /** Cuantos items disponibles hay en total, para saber si la lista va recortada. */
  catalogoTotal?: number;
};

export function saludoDelGiro(plantilla: PlantillaVertical | null, vertical?: string): string {
  return plantilla?.saludo ?? SALUDOS[vertical ?? ""] ?? SALUDOS.generico!;
}

export function saludo(negocio: Negocio, plantilla: PlantillaVertical | null): string {
  const propio = negocio.saludo?.trim();
  const patron = propio || saludoDelGiro(plantilla, negocio.vertical);
  return patron.replaceAll("{nombre}", negocio.nombre);
}

/** Las instrucciones de fábrica: la base común más la plantilla del vertical. */
export function baseDeFabrica(
  vertical: string,
  plantilla: PlantillaVertical | null,
): string {
  const instrucciones = plantilla?.instrucciones ?? PLANTILLAS[vertical] ?? PLANTILLAS.generico!;
  return `${BASE}\n${instrucciones}`;
}

export function construirPrompt({
  negocio,
  servicios,
  faq,
  plantilla,
  tiposCatalogo,
  catalogo,
  catalogoTotal,
}: ContextoPrompt): string {
  const ahora = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: negocio.zona_horaria,
  }).format(new Date());

  // Si el negocio reescribió su base, manda la suya. Los bloques que salen de
  // los datos se generan igual: no se congelan dentro del texto editado.
  const base = negocio.prompt_base?.trim()
    ? [negocio.prompt_base.trim()]
    : [BASE, plantilla?.instrucciones ?? PLANTILLAS[negocio.vertical] ?? PLANTILLAS.generico!];
  const lineas = [...base, `\nNEGOCIO: ${negocio.nombre}`];
  lineas.push(
    `AHORA MISMO: ${ahora} (hora de ${negocio.zona_horaria}).` +
      " Usa esto para entender 'manana', 'el viernes', 'la proxima semana'.",
  );

  const activos = servicios.filter((s) => s.activo);
  if (activos.length > 0) {
    lineas.push("\nSERVICIOS (usa el id exacto al llamar herramientas):");
    for (const s of activos) {
      const alias = s.alias.length > 0 ? ` — tambien le dicen: ${s.alias.join(", ")}` : "";
      const precio = s.precio ? `, $${Math.round(Number(s.precio))}` : "";
      lineas.push(`  - ${s.nombre} (id=${s.id}, ${s.duracion_min} min${precio})${alias}`);
    }
  }

  if (faq.length > 0) {
    lineas.push("\nINFORMACION DEL NEGOCIO:");
    for (const f of faq) lineas.push(`  - ${f.pregunta} -> ${f.respuesta}`);
  }

  const menu = (catalogo ?? []).filter((i) => i.disponible).slice(0, CATALOGO_EN_PROMPT);
  if (menu.length > 0) {
    lineas.push("\nMENU (esto SI existe; si te piden algo de esta lista, existe):");
    for (const i of menu) {
      const precio = i.precio ? ` $${Math.round(Number(i.precio))}` : "";
      const alias = i.alias.length > 0 ? ` (tambien: ${i.alias.join(", ")})` : "";
      lineas.push(`  - ${i.nombre}${precio} [${i.tipo}]${alias}`);
    }
    if ((catalogoTotal ?? menu.length) > menu.length) {
      lineas.push(
        "  ... hay mas. Esta lista esta recortada: si piden algo que no aparece," +
          " buscalo con consultar_catalogo antes de decir que no.",
      );
    }
    lineas.push(
      "  Para ingredientes, alergenos o detalle de un item usa consultar_catalogo." +
        " Los precios de arriba ya son buenos.",
    );
  } else if (tiposCatalogo.length > 0) {
    lineas.push(
      `\nCATALOGO: este negocio tiene informacion de ${tiposCatalogo.join(", ")}.` +
        " Usa consultar_catalogo con esos tipos cuando pregunten por eso.",
    );
  }

  if (negocio.instrucciones_extra) {
    lineas.push(`\nINDICACIONES DEL NEGOCIO:\n${negocio.instrucciones_extra}`);
  }

  if (plantilla?.herramientas.includes("recado")) {
    lineas.push(
      "\nSi no puedes resolver algo, toma recado con tomar_recado: " +
        "nombre, telefono confirmado repitiendolo, y que necesita.",
    );
  }

  lineas.push(
    "\nSi te preguntan algo que no esta aqui arriba, di que no tienes ese " +
      "dato a la mano y ofrece transferir. NO lo inventes.",
  );
  return lineas.join("\n");
}
