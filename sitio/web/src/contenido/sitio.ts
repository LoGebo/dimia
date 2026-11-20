/**
 * Contenido editable del sitio.
 * Todo lo que se cambia sin tocar componentes vive aquí.
 * Los corchetes son placeholders honestos: se quedan hasta que exista el dato real.
 */

export const FIRMA = {
  nombre: "Dimia Consulting",
  dominio: "dimia.mx",
  correo: "hola@dimia.mx",
  telefono: "+52 81 1518 8129",
  telefonoHref: "tel:+528115188129",
  // [ URL de la página de Dimia en LinkedIn por confirmar ]: vacío, el pie no pinta el enlace.
  linkedin: "",
  ciudad: "Monterrey",
  anio: 2026,
} as const;


export const NAVEGACION = [
  { href: "#funciones", texto: "Qué hace" },
  { href: "#giros", texto: "Por giro" },
  { href: "#pasos", texto: "Cómo empezar" },
  { href: "#precios", texto: "Precios" },
  { href: "#preguntas", texto: "Preguntas" },
] as const;

export const HERO = {
  aviso: "Software de agentes de voz para negocios con agenda",
  titular: "Nunca pierda otra cita por no contestar el teléfono.",
  entrada:
    "Dimia es un software que contesta su teléfono las 24 horas, agenda la cita y la confirma por WhatsApp.",
  ctaPrimario: "Agendar demostración",
  llamada: "Hable con el agente",
  hora: "21:04",
  contexto: "Su negocio ya cerró. El agente contesta.",
  garantias: ["Sin costo de activación", "Desde $2,990 MXN al mes", "Español de México"],
} as const;

export const LA_FIRMA = {
  titular: "Somos una consultora que se queda a operar lo que instala.",
  problemas: [
    {
      titulo: "La llamada en plena operación",
      texto: "Entra mientras atiende a alguien más. Nadie contesta y el cliente marca al siguiente de la lista.",
    },
    {
      titulo: "La cita de las nueve de la noche",
      texto: "Alguien quiere agendar cuando ya cerró. Mañana ya no se acuerda de volver a llamar.",
    },
    {
      titulo: "Los números que nadie revisó",
      texto: "Cuántas llamadas entraron, cuántas se volvieron cita y cuántas se perdieron. El dato existe, pero nadie lo usa.",
    },
  ],
  cuerpo:
    "Trabajamos con dueños de consultorios, clínicas, restaurantes, salones y despachos que ya tienen clientes y operación, pero no un sistema que los atienda a tiempo.",
  pilares: [
    {
      rotulo: "Diseñamos",
      texto: "Definimos qué hay que resolver primero y con qué dato se mide.",
    },
    {
      rotulo: "Construimos",
      texto: "Instalamos el agente, las integraciones y las automatizaciones, en producción.",
    },
    {
      rotulo: "Operamos",
      texto: "Respondemos por el funcionamiento diario y por la métrica acordada.",
    },
  ],
} as const;

export type Frente = {
  indice: string;
  titulo: string;
  resumen: string;
  detalle: string;
  puntos: string[];
};

export const PRACTICA: Frente[] = [
  {
    indice: "01",
    titulo: "Estrategia y arquitectura de decisión",
    resumen: "Qué decide el negocio, con qué dato y en qué momento.",
    detalle:
      "Levantamos la operación real, identificamos las decisiones que hoy se toman a ciegas y definimos la arquitectura mínima que las sostiene. El entregable es una hoja de ruta con secuencia, costo y responsable, no un diagnóstico para archivar.",
    puntos: [
      "Mapa de decisiones y datos faltantes",
      "Hoja de ruta por etapas medibles",
      "Caso de negocio con supuestos abiertos",
    ],
  },
  {
    indice: "02",
    titulo: "Datos e infraestructura analítica",
    resumen: "Bases confiables y tableros que un dueño puede leer solo.",
    detalle:
      "Consolidamos fuentes dispersas en una base única con reglas explícitas, y construimos los tableros que la dirección usa para decidir sin que nadie se los explique.",
    puntos: [
      "Integración de fuentes y limpieza",
      "Modelo de datos documentado",
      "Tableros de operación y dirección",
    ],
  },
  {
    indice: "03",
    titulo: "Inteligencia artificial aplicada",
    resumen: "El método, no el argumento. Se justifica por lo que resuelve.",
    detalle:
      "Aplicamos modelos donde hay un tramo repetitivo, un texto que nadie lee o una conversación que nadie alcanza a atender. Cada uso queda acotado, evaluado y con salida auditable.",
    puntos: [
      "Agentes de voz y atención conversacional",
      "Clasificación y extracción documental",
      "Evaluación y control de calidad del modelo",
    ],
  },
  {
    indice: "04",
    titulo: "Automatización de operaciones",
    resumen: "El tramo mecánico, ejecutado y auditado.",
    detalle:
      "Confirmaciones, recordatorios, cobranza, seguimiento, altas y reportes. Automatizamos el tramo mecánico y dejamos cada acción con registro, responsable y reversa.",
    puntos: [
      "Flujos con registro por acción",
      "Integración con sistemas existentes",
      "Alertas por excepción, no por volumen",
    ],
  },
  {
    indice: "05",
    titulo: "Medición contra ingreso",
    resumen: "Qué acción produjo cada oportunidad y cuánto valió.",
    detalle:
      "Conectamos campañas, llamadas y oportunidades con el ingreso facturado. La conversación deja de ser sobre clics y pasa a ser sobre pesos.",
    puntos: [
      "Origen registrado por oportunidad",
      "Conciliación con facturación",
      "Reporte único para dirección",
    ],
  },
];

export const METODO = [
  {
    indice: "01 · Diagnóstico",
    duracion: "2 semanas",
    texto:
      "Levantamos la operación real y dónde se pierde el ingreso. Salimos con hoja de ruta y métrica acordada.",
  },
  {
    indice: "02 · Piloto",
    duracion: "4 semanas",
    texto: "Un tramo acotado en producción, con la métrica definida antes de empezar.",
  },
  {
    indice: "03 · Operación",
    duracion: "Continuo",
    texto: "Operamos el sistema y respondemos por su funcionamiento diario.",
  },
  {
    indice: "04 · Escala",
    duracion: "Continuo",
    texto: "Se extiende a más procesos, sucursales y fuentes con la misma base.",
  },
] as const;

/**
 * Carrusel de clientes.
 * `logo` se llena con la ruta del archivo en /public/clientes/ cuando exista
 * autorización por escrito. Mientras sea null, la celda muestra el placeholder.
 */
/** `alto` es la altura en px del logotipo en la cinta: se ajusta a ojo por mancha óptica. */
export type Cliente = { nombre: string; logo: string | null; alto?: number };

export const MOSTRAR_CARRUSEL = true;

// Deja el archivo autorizado en public/marca/clientes/<archivo> y aparece solo;
// mientras no exista, el carrusel muestra el nombre en texto (sin imagen rota).
export const CLIENTES: Cliente[] = [
  { nombre: "Atos", logo: "/marca/clientes/atos.png", alto: 38 },
  { nombre: "Heineken", logo: "/marca/clientes/heineken.png", alto: 40 },
  { nombre: "Arca Continental", logo: "/marca/clientes/arca.png", alto: 62 },
  { nombre: "Tec de Monterrey", logo: "/marca/clientes/tec.png", alto: 54 },
  { nombre: "UERRE", logo: "/marca/clientes/uerre.png", alto: 30 },
];

export const NOTA_CLIENTES = "Equipos con los que hemos trabajado";

export const PRODUCTO = {
  titular: "Un número que contesta, agenda y confirma",
  entrada:
    "El agente se presenta como asistente de su negocio, entiende lo que le piden y escribe la cita antes de colgar. Después se la confirma al cliente por WhatsApp.",
  fichas: [
    { rotulo: "Qué resuelve", valor: "La llamada que nadie alcanza a contestar" },
    { rotulo: "Para quién", valor: "Negocios con agenda y volumen telefónico" },
    { rotulo: "Se conecta con", valor: "Su línea telefónica, WhatsApp, su calendario y su CRM" },
  ],
} as const;

export const PROXIMOS = [
  { nombre: "[ Nombre del producto ]", estado: "Próximamente" },
  { nombre: "[ Nombre del producto ]", estado: "Próximamente" },
] as const;

/** Agenda que acompaña al panel de demostración: el horario reservado se llena al confirmar. */
export const AGENDA_DEMO = {
  dia: "Jueves 4",
  horarios: ["18:00", "18:30", "19:00", "19:30"],
  reservado: "18:30",
} as const;

/** Secuencia del panel de llamada. `d` son milisegundos de espera antes del paso. */
export const PASOS_LLAMADA = [
  { d: 900, fase: "espera", texto: "Llamada entrante · número no registrado" },
  { d: 800, fase: "llamada", texto: "Contesta el agente de voz" },
  { d: 1100, fase: "llamada", texto: "Intención detectada · reservar mesa" },
  { d: 1100, fase: "llamada", texto: "Consulta de disponibilidad en la base" },
  { d: 1200, fase: "llamada", texto: "Propone jueves 4 · 18:30 · 4 personas" },
  { d: 1200, fase: "llamada", texto: "Escribe la reserva #A-2291", folio: "#A-2291" },
  { d: 900, fase: "confirmada", texto: "Reserva confirmada en 00:42" },
  { d: 1300, fase: "confirmada", texto: "Aviso por WhatsApp preparado" },
  { d: 2800, fase: "reinicio", texto: null },
] as const;

export const GARANTIA = {
  rotulo: "La garantía",
  titular: "Dos citas encimadas son imposibles por diseño",
  cuerpo:
    "La disponibilidad no se calcula en la conversación: la decide la base. Si el horario ya está tomado, la reserva se rechaza y el agente ofrece el siguiente hueco en la misma llamada.",
  ruta: ["Llamada", "Consulta de disponibilidad", "Restricción de la base", "Reserva confirmada"],
  colision: {
    confirmada: { horario: "17:00–17:30", estado: "Confirmada" },
    rechazada: { horario: "17:15–17:45", estado: "Rechazada por la base" },
    ofrecida: { horario: "17:45–18:15", estado: "Se ofrece" },
    nota: "Se ofrece 17:45 en la misma llamada.",
    repetir: "Repetir la demostración",
    registro: ["Cita existente", "Nueva solicitud", "Siguiente hueco"],
  },
  /** La restricción tal cual vive en proyectos/voz/supabase/migrations/20260822000001_esquema_inicial.sql */
  restriccion: {
    nombre: "booking_sin_traslape",
    codigo: `alter table booking
  add constraint booking_sin_traslape
  exclude using gist (
    resource_id with =,
    tstzrange(inicio, fin, '[)') with &&
  )
  where (estado = 'confirmada');`,
    pie: "La restricción real del motor de reservas, en la base de datos.",
  },
  cita: "«Automatización con garantía, no con buenas intenciones.»",
} as const;

export const PLANES = {
    titular: "Precios mensuales, sin costo de activación",
  razones: [
    "Configuración adaptada a su negocio",
    "Datos organizados en su panel",
    "Sin costo de activación",
  ],
  columnas: [
    {
      nombre: "Básico",
      precio: 2990,
      minutos: 200,
      incluye: "",
      canales: "Llamadas, WhatsApp, Instagram y Messenger",
      panel: "Panel esencial",
      soporte: "WhatsApp",
      paraQuien: "Empresas que quieren empezar a capturar oportunidades",
      premium: 499,
      elegido: false,
    },
    {
      nombre: "Negocio",
      precio: 3690,
      minutos: 500,
      incluye: "",
      canales: "Todos los canales disponibles",
      panel: "Panel completo",
      soporte: "WhatsApp",
      paraQuien: "Equipos que reciben clientes por varios canales",
      premium: 1249,
      elegido: true,
    },
    {
      nombre: "Empresa",
      precio: 4790,
      minutos: 1000,
      incluye: "Panel y analítica incluidos",
      canales: "Todos los canales disponibles",
      panel: "Panel completo",
      soporte: "Prioritario",
      paraQuien: "Operaciones con mayor volumen, áreas o puntos de atención",
      premium: 2499,
      elegido: false,
    },
  ],
  premium: {
    texto:
      "Premium agrega una voz más natural y un modelo con mayor capacidad para conversaciones complejas.",
  },
  condiciones: [
    "Personalización, plataforma y datos incluidos en todos los planes.",
    "Sin costo de activación.",
    "Bloque adicional de 100 minutos: $590 MXN.",
    "Precios mensuales y antes de impuestos.",
  ],
  comparacion: [
    { fila: "Precio mensual", valores: ["$2,990", "$3,690", "$4,790"] },
    { fila: "Minutos incluidos", valores: ["200", "500", "1,000"] },
    { fila: "Canales", valores: ["4 canales", "Todos", "Todos"] },
    { fila: "Panel", valores: ["Esencial", "Completo", "Completo"] },
    { fila: "Soporte", valores: ["WhatsApp", "WhatsApp", "Prioritario"] },
    { fila: "Personalización", valores: ["Incluida", "Incluida", "Incluida"] },
    { fila: "Plataforma", valores: ["Gratis", "Gratis", "Gratis"] },
    { fila: "Datos", valores: ["Gratis", "Gratis", "Gratis"] },
    { fila: "Bloque adicional (100 min)", valores: ["$590", "$590", "$590"] },
    { fila: "Premium (adicional)", valores: ["+$499", "+$1,249", "+$2,499"] },
  ],
} as const;

export type Caso = {
  giro: string;
  titulo: string;
  problema: string;
  instalado: string;
  resultado: string;
  periodo: string;
  integraciones: string;
};

export const CASOS: Caso[] = [
  {
    giro: "Restaurantes",
    titulo: "[ Nombre del cliente autorizado ]",
    problema:
      "Las llamadas de reserva entraban en horas de servicio y nadie podía contestarlas. La agenda vivía en una libreta y se encimaban mesas.",
    instalado:
      "Agente de voz en el número principal, base de reservas con restricción de traslape y aviso por WhatsApp al comensal.",
    resultado: "[ Resultado por confirmar ]",
    periodo: "[ Periodo medido ]",
    integraciones: "Telefonía SIP · WhatsApp · Calendario",
  },
  {
    giro: "Consultorios",
    titulo: "[ Nombre del cliente autorizado ]",
    problema:
      "Una recepción atendía teléfono, pacientes y confirmaciones al mismo tiempo. Las citas fuera de horario se perdían.",
    instalado:
      "Atención telefónica continua, confirmación y recordatorio automáticos, y expediente de cada llamada.",
    resultado: "[ Resultado por confirmar ]",
    periodo: "[ Periodo medido ]",
    integraciones: "Telefonía SIP · WhatsApp · CRM",
  },
  {
    giro: "Clínicas",
    titulo: "[ Nombre del cliente autorizado ]",
    problema: "Tres sucursales con agendas separadas y sin visibilidad conjunta de la ocupación.",
    instalado: "Base única de disponibilidad, ruteo por sucursal y tablero de ocupación para dirección.",
    resultado: "[ Resultado por confirmar ]",
    periodo: "[ Periodo medido ]",
    integraciones: "Calendario · Base de datos · Tablero",
  },
  {
    giro: "Empresas de servicios",
    titulo: "[ Nombre del cliente autorizado ]",
    problema: "Las campañas generaban llamadas, pero nadie sabía cuáles terminaban en venta.",
    instalado: "Registro de origen por llamada y conciliación con el ingreso facturado.",
    resultado: "[ Resultado por confirmar ]",
    periodo: "[ Periodo medido ]",
    integraciones: "CRM · Facturación · Analítica",
  },
];

export const SOCIOS = [
  {
    iniciales: "RD",
    nombre: "Rogelio Díaz Alanís",
    cargo: "Socio · Operaciones",
    trayectoria: "[ Trayectoria verificable por confirmar ]",
    acento: true,
  },
  {
    iniciales: "JM",
    nombre: "Jesús Daniel Martínez García",
    cargo: "Socio · Tecnología",
    trayectoria: "[ Trayectoria verificable por confirmar ]",
    acento: false,
  },
] as const;

export const CIERRE = {
  titular: "Llame ahora. Contesta el agente.",
  formulario: "O déjenos sus datos y agendamos una demostración.",
  notaTelefono: "Este número lo contesta el agente de voz de Dimia, a cualquier hora.",
  declaracion: "Sistemas de decisión para empresas que ya no alcanzan a contestar.",
} as const;

/** Preguntas frecuentes. Cada respuesta sale del manual de marca o de los planes: nada inventado. */
export const PREGUNTAS = [
  {
    p: "¿El agente se hace pasar por una persona?",
    r: "No. Desde el inicio de la llamada se presenta como asistente de su negocio.",
  },
  {
    p: "¿Qué pasa si no entiende lo que le piden?",
    r: "A la segunda confusión ofrece pasar la llamada con una persona de su equipo.",
  },
  {
    p: "¿Puede dar una cita en un horario que ya está ocupado?",
    r: "No. La disponibilidad la decide la base de datos, no la conversación. Si el horario está tomado, la reserva se rechaza y el agente ofrece el siguiente espacio libre en la misma llamada.",
  },
  {
    p: "¿Puede inventar horarios o precios?",
    r: "No. El agente solo ofrece lo que está registrado en su agenda y en su catálogo.",
  },
  {
    p: "¿Hay costo de activación?",
    r: "No. Paga el plan mensual que elija. Los precios son antes de impuestos.",
  },
  {
    p: "¿Qué pasa si se terminan los minutos del mes?",
    r: "Puede agregar bloques de 100 minutos por $590 MXN cada uno.",
  },
] as const;

/**
 * Conversaciones de demostración por giro. Son ejemplos de cómo habla el agente
 * (manual de marca, «La voz al teléfono»), no llamadas de clientes reales.
 */
export type Giro = {
  giro: string;
  lineas: { quien: "agente" | "cliente"; texto: string }[];
  resultado: { tipo: string; dia: string; hora: string; detalle: string };
};

export const CONVERSACIONES: Giro[] = [
  {
    giro: "Restaurante",
    lineas: [
      { quien: "agente", texto: "Buenas noches, habla el asistente del restaurante. ¿En qué le ayudo?" },
      { quien: "cliente", texto: "Quiero una mesa para cuatro el jueves en la noche." },
      { quien: "agente", texto: "Jueves 4, seis y media de la tarde, cuatro personas. ¿Es correcto?" },
      { quien: "cliente", texto: "Sí, perfecto." },
      { quien: "agente", texto: "Listo. Le llega la confirmación por WhatsApp." },
    ],
    resultado: { tipo: "Reserva", dia: "Jueves 4", hora: "18:30", detalle: "4 personas" },
  },
  {
    giro: "Consultorio",
    lineas: [
      { quien: "agente", texto: "Buenas noches, habla el asistente del consultorio. ¿En qué le ayudo?" },
      { quien: "cliente", texto: "Necesito cita con la doctora, de preferencia en la mañana." },
      { quien: "agente", texto: "Tengo martes 9 a las diez de la mañana. ¿Le acomoda?" },
      { quien: "cliente", texto: "Sí, ese día está bien." },
      { quien: "agente", texto: "Queda agendada. Un día antes le recuerdo por WhatsApp." },
    ],
    resultado: { tipo: "Cita", dia: "Martes 9", hora: "10:00", detalle: "Consulta general" },
  },
  {
    giro: "Salón",
    lineas: [
      { quien: "agente", texto: "Buenas noches, habla el asistente del salón. ¿En qué le ayudo?" },
      { quien: "cliente", texto: "¿Tienen lugar para corte y tinte el sábado?" },
      { quien: "agente", texto: "Sábado 13 a las once de la mañana, corte y tinte. ¿Se lo aparto?" },
      { quien: "cliente", texto: "Sí, por favor." },
      { quien: "agente", texto: "Apartado. Le mando la confirmación por WhatsApp." },
    ],
    resultado: { tipo: "Cita", dia: "Sábado 13", hora: "11:00", detalle: "Corte y tinte" },
  },
  {
    giro: "Despacho",
    lineas: [
      { quien: "agente", texto: "Buenas noches, habla el asistente del despacho. ¿En qué le ayudo?" },
      { quien: "cliente", texto: "Quiero una asesoría sobre mi declaración anual." },
      { quien: "agente", texto: "Jueves 11, cinco de la tarde, asesoría fiscal. ¿Es correcto?" },
      { quien: "cliente", texto: "Sí, gracias." },
      { quien: "agente", texto: "Agendada. Le llega el detalle por WhatsApp." },
    ],
    resultado: { tipo: "Asesoría", dia: "Jueves 11", hora: "17:00", detalle: "Declaración anual" },
  },
];

/** Diagrama del día: horario de atención de ejemplo frente a las 24 horas del agente. */
export const DIA = {
  titular: "Su negocio cierra. Su teléfono, ya no.",
  entrada:
    "Las llamadas no llegan solo en horario de oficina. El agente contesta las que su equipo no alcanza: en plena operación, a la hora de comida y después de cerrar.",
  apertura: 9,
  cierre: 19,
  filas: ["Su recepción", "Agente Dimia"],
  nota: "Horario de atención de ejemplo: 9:00 a 19:00.",
} as const;

/**
 * Panel de demostración de la portada: así se ve el día en el panel del negocio.
 * Datos de ejemplo de un restaurante, no de un cliente real.
 */
export type EstadoLlamada = "confirmada" | "sinConfirmar" | "resuelta" | "transferida";

export const PANEL_DEMO = {
  negocio: "Restaurante",
  menu: ["Hoy", "Agenda", "Bandeja", "Clientes", "Recados", "Resumen"],
  dia: "Hoy · jueves 4",
  estados: {
    confirmada: { texto: "Confirmada", color: "var(--bueno)" },
    sinConfirmar: { texto: "Sin confirmar", color: "var(--alerta)" },
    resuelta: { texto: "Resuelta", color: "var(--acero)" },
    transferida: { texto: "Pasó a su equipo", color: "var(--acento)" },
  },
  llamadas: [
    {
      hora: "21:04",
      duracion: "00:42",
      resumen: "Reserva para 4 · jueves 18:30",
      estado: "confirmada" as EstadoLlamada,
      lineas: [
        { quien: "agente", texto: "Buenas noches, habla el asistente del restaurante. ¿En qué le ayudo?" },
        { quien: "cliente", texto: "Quiero una mesa para cuatro el jueves en la noche." },
        { quien: "agente", texto: "Jueves 4, seis y media de la tarde, cuatro personas. ¿Es correcto?" },
        { quien: "cliente", texto: "Sí, perfecto." },
      ],
      cierre: "Reserva #A-2291 escrita · confirmación enviada por WhatsApp",
    },
    {
      hora: "20:37",
      duracion: "00:21",
      resumen: "Pregunta si hay estacionamiento",
      estado: "resuelta" as EstadoLlamada,
      lineas: [
        { quien: "cliente", texto: "¿Tienen estacionamiento?" },
        { quien: "agente", texto: "Sí, hay estacionamiento sin costo para clientes. ¿Le ayudo con una reserva?" },
        { quien: "cliente", texto: "No por ahora, gracias." },
      ],
      cierre: "Respondida con la información registrada del negocio",
    },
    {
      hora: "19:52",
      duracion: "00:38",
      resumen: "Reserva para 2 · viernes 14:00",
      estado: "sinConfirmar" as EstadoLlamada,
      lineas: [
        { quien: "cliente", texto: "Una mesa para dos mañana a las dos." },
        { quien: "agente", texto: "Viernes 5, dos de la tarde, dos personas. ¿Es correcto?" },
        { quien: "cliente", texto: "Sí." },
      ],
      cierre: "Reserva escrita · esperando respuesta al WhatsApp de confirmación",
    },
    {
      hora: "18:15",
      duracion: "00:55",
      resumen: "Pide hablar con el gerente",
      estado: "transferida" as EstadoLlamada,
      lineas: [
        { quien: "cliente", texto: "Quisiera hablar con el gerente, por favor." },
        { quien: "agente", texto: "Con gusto. Le paso con una persona del equipo." },
      ],
      cierre: "Llamada transferida al número del encargado",
    },
    {
      hora: "13:40",
      duracion: "00:47",
      resumen: "Reserva para 6 · sábado 21:00",
      estado: "confirmada" as EstadoLlamada,
      lineas: [
        { quien: "cliente", texto: "Somos seis para el sábado en la noche." },
        { quien: "agente", texto: "Sábado 6, nueve de la noche, seis personas. ¿Es correcto?" },
        { quien: "cliente", texto: "Así es." },
      ],
      cierre: "Reserva #A-2285 escrita · el cliente confirmó por WhatsApp",
    },
  ],
} as const;

export const DECLARACION = {
  fuerte: "Un sistema, no un bot.",
  resto: "El agente contesta, la base de datos decide la agenda y nosotros respondemos por que funcione cada día.",
  puntos: [
    {
      titulo: "Habla como su negocio",
      texto: "Español de México, de usted. Se presenta como asistente y nunca finge ser una persona.",
    },
    {
      titulo: "No encima citas",
      texto: "La disponibilidad la decide la base de datos. Un horario ocupado no se puede volver a dar.",
    },
    {
      titulo: "Operado por Dimia",
      texto: "Lo instalamos, lo vigilamos y lo ajustamos. Usted no administra ningún sistema.",
    },
  ],
} as const;

/** Capítulos del producto, en el orden en que pasa una llamada. */
export const CAPITULOS = {
  contesta: {
    numero: "1.0",
    nombre: "Contesta",
    titular: "Cada llamada, atendida.",
    entrada:
      "Se presenta como asistente de su negocio, entiende lo que le piden y confirma con números. A la segunda confusión, pasa la llamada a su equipo.",
  },
  agenda: {
    numero: "2.0",
    nombre: "Agenda",
    titular: "Una agenda que no se encima.",
    entrada:
      "El agente no decide si hay lugar: lo decide la base de datos. Atiende a cualquier hora y nunca da dos veces el mismo horario.",
  },
  confirma: {
    numero: "3.0",
    nombre: "Confirma",
    titular: "La confirmación sale sola.",
    entrada:
      "Al colgar, el cliente recibe su cita por WhatsApp y puede confirmarla con una respuesta. En el panel usted ve quién confirmó y quién sigue sin hacerlo.",
  },
  panel: {
    numero: "4.0",
    nombre: "Revisa",
    titular: "Todo su día, en un solo panel.",
    entrada:
      "Cada llamada queda registrada con lo que se dijo y cómo terminó. Toque una llamada para ver la conversación.",
  },
} as const;

/** Mensaje de WhatsApp de ejemplo, con botones de respuesta rápida. */
export const WHATSAPP_DEMO = {
  remitente: "Restaurante",
  mensaje: "Su reserva quedó registrada: jueves 4 a las 18:30, para 4 personas. ¿Nos confirma su asistencia?",
  hora: "21:05",
  botones: ["Confirmar", "Cambiar"],
  respuestaHora: "21:07",
  confirmacion: "Gracias. Su reserva está confirmada.",
} as const;

/** Lo que hace el agente. Cada tarjeta lleva una ilustración de interfaz. */
export const FUNCIONES = {
  titular: "Un agente que atiende su teléfono como lo haría su mejor recepcionista.",
  entrada: "Contesta, entiende lo que le piden y deja la cita escrita antes de colgar.",
  tarjetas: [
    {
      clave: "contesta",
      titulo: "Contesta las 24 horas",
      texto: "En plena operación, a la hora de comida o después de cerrar. Ninguna llamada se queda sin respuesta.",
    },
    {
      clave: "agenda",
      titulo: "Agenda en su calendario",
      texto: "Ofrece solo horarios libres. Si alguien ya tomó el lugar, propone el siguiente en la misma llamada.",
    },
    {
      clave: "whatsapp",
      titulo: "Confirma por WhatsApp",
      texto: "Al colgar, el cliente recibe su cita por WhatsApp y la confirma con un botón.",
    },
    {
      clave: "responde",
      titulo: "Responde preguntas",
      texto: "Horarios, precios, ubicación y servicios, con la información que usted registra. No inventa nada.",
    },
    {
      clave: "transfiere",
      titulo: "Pasa la llamada a su equipo",
      texto: "Si el cliente pide hablar con alguien o el agente no entiende dos veces, transfiere la llamada.",
    },
    {
      clave: "panel",
      titulo: "Todo queda en su panel",
      texto: "Cada llamada con su resumen y su estado: confirmada, sin confirmar o atendida por su equipo.",
    },
  ],
} as const;

export const GIROS = {
  titular: "Funciona para cualquier negocio que vive de su agenda.",
  entrada: "Elija su giro y escuche cómo contesta el agente una llamada fuera de horario.",
} as const;

export const WHATSAPP = {
  titular: "Confirmaciones por WhatsApp, sin que nadie las mande.",
  entrada:
    "El cliente recibe su cita al colgar y la confirma con un botón. Usted ve en el panel quién confirmó y quién sigue sin hacerlo, y decide qué pasa con las citas sin respuesta.",
} as const;

export const INTEGRACIONES = {
  titular: "Se conecta con lo que ya usa.",
  entrada: "No tiene que cambiar su forma de trabajar.",
  lista: [
    { nombre: "Su número de teléfono", texto: "El agente contesta en su línea por telefonía SIP." },
    { nombre: "WhatsApp", texto: "Confirmaciones y avisos con plantillas aprobadas por Meta." },
    { nombre: "Calendario", texto: "Las citas quedan en la agenda que usted ya revisa." },
    { nombre: "CRM", texto: "Cada cliente y cada llamada, registrados donde los necesita." },
  ],
} as const;

export const PASOS = {
  titular: "Empiece en tres pasos.",
  entrada: "Usted no instala ni administra nada. Nosotros lo hacemos.",
  lista: [
    {
      titulo: "Demostración",
      texto: "Le mostramos el agente contestando con el caso de su negocio y resolvemos sus dudas.",
    },
    {
      titulo: "Configuración",
      texto: "Cargamos sus horarios, servicios, precios y la forma en que quiere que se atienda a sus clientes.",
    },
    {
      titulo: "En operación",
      texto: "Conectamos su número y el agente empieza a contestar. Nosotros lo vigilamos y lo ajustamos.",
    },
  ],
} as const;

export const MAS_SERVICIOS = {
  titular: "Además del agente.",
  entrada:
    "Somos una consultora mexicana. Cuando el agente ya está operando, también trabajamos en los datos, las automatizaciones y la medición de su negocio.",
} as const;

export const CIERRE_CTA = {
  titular: "Cada llamada sin contestar es un cliente que llama a otro lado.",
  entrada: "Llame ahora a nuestro número y hable con el agente, o agende una demostración.",
} as const;
