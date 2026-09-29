/**
 * Prototipo de Ventas: datos de ejemplo para revisar las pantallas antes de construir el motor
 * (planeacion/agente-seguimiento-leads.md). Nada de esto sale de la base.
 */
export type Grupo = "persona" | "nuevo" | "seguimiento" | "cita" | "perdido";

export type EventoInteresado = { hora: string; quien: "agente" | "interesado" | "sistema" | "equipo"; texto: string; llamada?: boolean };

/** El agente de ventas del negocio: siempre visible, con lo que está haciendo en este momento. */
export const AGENTE = {
  nombre: "Vendedora",
  avatar: "pastilla:#3fb68b",
  ahora: "Llamando a Jorge Castillo",
  hoy: "Contestó a 12 personas en 18 s promedio · agendó 3 citas",
};

export type Opcion = { letra: string; titulo: string; detalle?: string };
export type Decision = { pregunta: string; opciones: Opcion[] };
export type PasoPlan = { cuando: string; que: string; hecho?: boolean };

export type Interesado = {
  id: string;
  nombre: string;
  telefono: string;
  canal: "WhatsApp" | "Formulario" | "Instagram" | "Llamada perdida";
  origen: string;
  grupo: Grupo;
  resumen: string;
  hace: string;
  paso: number;
  pasos: number;
  siguiente?: string;
  consentimiento: string;
  eventos: EventoInteresado[];
  /** Lo que el agente entiende del interesado, en una frase. */
  lectura: string;
  /** Cuando el agente no puede seguir solo: la pregunta al dueño con opciones. */
  decision?: Decision;
  plan: PasoPlan[];
};

export const GRUPOS: { clave: Grupo; nombre: string }[] = [
  { clave: "persona", nombre: "Requieren a una persona" },
  { clave: "nuevo", nombre: "Nuevos" },
  { clave: "seguimiento", nombre: "En seguimiento" },
  { clave: "cita", nombre: "Con cita" },
  { clave: "perdido", nombre: "Perdidos" },
];

export const INTERESADOS: Interesado[] = [
  {
    id: "1", nombre: "Laura Méndez", telefono: "+52 81 1234 5678", canal: "WhatsApp", origen: "Anuncio «Limpieza dental»",
    grupo: "persona", resumen: "Pregunta por precio de paquete familiar", hace: "3 min", paso: 2, pasos: 6,
    consentimiento: "Aceptó el aviso de privacidad en el anuncio · 29-sep 10:02",
    eventos: [
      { hora: "10:02", quien: "sistema", texto: "Llegó por el anuncio «Limpieza dental»" },
      { hora: "10:02", quien: "agente", texto: "Hola Laura, soy la asistente virtual de la Clínica. Vi que pidió informes de limpieza dental. ¿Para cuándo le gustaría venir?" },
      { hora: "10:03", quien: "agente", texto: "Llamada · no contestó (buzón, dejó mensaje de 15 s)", llamada: true },
      { hora: "10:40", quien: "interesado", texto: "¿Cuánto cuesta si vamos mi esposo, mis 2 hijos y yo?" },
      { hora: "10:41", quien: "sistema", texto: "Pasada a una persona: pregunta por precio fuera del catálogo" },
    ],
    lectura: "Quiere limpieza para 4 personas y pregunta por un precio familiar que no está en su catálogo.",
    decision: { pregunta: "Laura pregunta cuánto le cuesta la limpieza para ella, su esposo y sus 2 hijos. No tengo precio familiar. ¿Qué le digo?", opciones: [
      { letra: "A", titulo: "Ofrecerle 10 % de descuento por 4 personas", detalle: "Le cotizo y le propongo sábado 10:00" },
      { letra: "B", titulo: "Precio normal por persona", detalle: "4 × limpieza, sin descuento" },
      { letra: "C", titulo: "Que le llame usted", detalle: "Le aviso a Laura que la contacta el doctor hoy" },
    ] },
    plan: [
      { cuando: "10:02", que: "WhatsApp de bienvenida", hecho: true },
      { cuando: "10:03", que: "Llamada", hecho: true },
      { cuando: "Ahora", que: "Espera su respuesta sobre el precio" },
      { cuando: "Después", que: "Agendar a la familia y confirmar por WhatsApp" },
    ],
  },
  {
    id: "2", nombre: "Tienda Sol", telefono: "+52 81 8765 4321", canal: "Llamada perdida", origen: "Llamada directa",
    grupo: "persona", resumen: "Pidió hablar con el encargado", hace: "1 h", paso: 1, pasos: 6,
    consentimiento: "Llamó al negocio · 29-sep 09:10",
    eventos: [
      { hora: "09:10", quien: "sistema", texto: "Llamada perdida" },
      { hora: "09:11", quien: "agente", texto: "Devolvió la llamada · 1 min 40 s", llamada: true },
      { hora: "09:13", quien: "sistema", texto: "Pasada a una persona: pidió hablar con el encargado" },
    ],
    lectura: "Es un negocio vecino; quiere hablar con el encargado sobre un convenio para sus empleados.",
    decision: { pregunta: "Tienda Sol quiere un convenio para sus empleados. Eso lo decide usted. ¿Cómo sigo?", opciones: [
      { letra: "A", titulo: "Agendarle una llamada con usted", detalle: "Le ofrezco mañana 12:00 o 17:00" },
      { letra: "B", titulo: "Pedirle los detalles por WhatsApp", detalle: "Cuántos empleados y qué servicios" },
    ] },
    plan: [
      { cuando: "09:11", que: "Devolvió la llamada perdida", hecho: true },
      { cuando: "Ahora", que: "Espera su decisión" },
    ],
  },
  {
    id: "3", nombre: "Pedro Ruiz", telefono: "+52 81 5555 0101", canal: "Formulario", origen: "Página web",
    grupo: "nuevo", resumen: "Contactado en 12 s", hace: "12 s", paso: 1, pasos: 6, siguiente: "Llamada en 2 h",
    consentimiento: "Marcó la casilla del aviso de privacidad · 29-sep 11:20",
    eventos: [
      { hora: "11:20", quien: "sistema", texto: "Llenó el formulario: «Quiero una valoración de ortodoncia»" },
      { hora: "11:20", quien: "agente", texto: "Llamada · contestó · 2 min 10 s", llamada: true },
      { hora: "11:22", quien: "agente", texto: "Quedó pendiente: confirma horario con su esposa y avisa por WhatsApp" },
    ],
    lectura: "Quiere valoración de ortodoncia; confirma horario con su esposa.",
    plan: [
      { cuando: "11:20", que: "Llamada en 12 s · contestó", hecho: true },
      { cuando: "13:20", que: "WhatsApp: «¿Ya pudo ver el horario?»" },
      { cuando: "Mañana 10:00", que: "Llamada si no responde" },
    ],
  },
  {
    id: "4", nombre: "Mariana Soto", telefono: "+52 81 4444 2020", canal: "Instagram", origen: "Mensaje directo",
    grupo: "nuevo", resumen: "Preguntó si atienden sábados", hace: "25 min", paso: 1, pasos: 6, siguiente: "WhatsApp mañana 10:00",
    consentimiento: "Escribió al negocio · 29-sep 10:55",
    eventos: [
      { hora: "10:55", quien: "interesado", texto: "¿Atienden los sábados?" },
      { hora: "10:55", quien: "agente", texto: "Sí, los sábados de 9 a 14 h. ¿Le aparto un espacio este sábado?" },
    ],
    lectura: "Busca atención en sábado; parece prioridad por su horario de trabajo.",
    plan: [
      { cuando: "10:55", que: "Le contestó en Instagram", hecho: true },
      { cuando: "Mañana 10:00", que: "WhatsApp con 2 horarios del sábado" },
    ],
  },
  {
    id: "5", nombre: "Jorge Castillo", telefono: "+52 81 3333 7070", canal: "WhatsApp", origen: "Anuncio «Blanqueamiento»",
    grupo: "seguimiento", resumen: "No ha contestado", hace: "1 día", paso: 3, pasos: 6, siguiente: "Llamada hoy 17:30",
    consentimiento: "Aceptó el aviso de privacidad en el anuncio · 28-sep 16:12",
    eventos: [
      { hora: "Ayer 16:12", quien: "sistema", texto: "Llegó por el anuncio «Blanqueamiento»" },
      { hora: "Ayer 16:12", quien: "agente", texto: "Mensaje de bienvenida enviado" },
      { hora: "Ayer 16:13", quien: "agente", texto: "Llamada · no contestó", llamada: true },
      { hora: "Ayer 18:15", quien: "agente", texto: "Llamada · no contestó", llamada: true },
    ],
    lectura: "No ha contestado ni llamadas ni mensajes. Pidió informes de blanqueamiento.",
    plan: [
      { cuando: "Ayer", que: "WhatsApp y 2 llamadas", hecho: true },
      { cuando: "Ahora", que: "Llamándolo en otra franja" },
      { cuando: "Día 3", que: "Llamada" },
      { cuando: "Día 6", que: "Último WhatsApp: «¿Lo dejamos para después?»" },
    ],
  },
  {
    id: "6", nombre: "Ana González", telefono: "+52 81 2222 9090", canal: "Formulario", origen: "Página web",
    grupo: "cita", resumen: "Cita el martes 10:00", hace: "2 días", paso: 2, pasos: 6,
    consentimiento: "Marcó la casilla del aviso de privacidad · 27-sep 12:40",
    eventos: [
      { hora: "27-sep 12:40", quien: "sistema", texto: "Llenó el formulario" },
      { hora: "27-sep 12:40", quien: "agente", texto: "Llamada · contestó · 3 min", llamada: true },
      { hora: "27-sep 12:43", quien: "agente", texto: "Agendó: martes 30-sep 10:00 · Limpieza" },
      { hora: "27-sep 12:43", quien: "agente", texto: "Confirmación enviada por WhatsApp" },
    ],
    lectura: "Cita confirmada para limpieza el martes 10:00.",
    plan: [
      { cuando: "27-sep", que: "Agendó y confirmó", hecho: true },
      { cuando: "Lunes 10:00", que: "Recordatorio 24 h antes" },
      { cuando: "Martes 8:00", que: "Recordatorio 2 h antes" },
    ],
  },
  {
    id: "7", nombre: "Luis Pérez", telefono: "+52 81 1111 3030", canal: "WhatsApp", origen: "Campaña «Pacientes inactivos»",
    grupo: "perdido", resumen: "No le interesa por ahora", hace: "4 días", paso: 4, pasos: 6,
    consentimiento: "Cliente con consentimiento de novedades · 12-ago",
    eventos: [
      { hora: "25-sep", quien: "agente", texto: "Mensaje de la campaña enviado" },
      { hora: "25-sep", quien: "interesado", texto: "Por ahora no, gracias" },
      { hora: "25-sep", quien: "sistema", texto: "Seguimiento detenido: respuesta negativa" },
    ],
    lectura: "Dijo que por ahora no. Lo dejo tranquilo.",
    plan: [
      { cuando: "25-sep", que: "Seguimiento detenido", hecho: true },
      { cuando: "Dentro de 3 meses", que: "Novedades, porque aceptó recibirlas" },
    ],
  },
];
