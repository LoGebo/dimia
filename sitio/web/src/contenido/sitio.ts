/**
 * Contenido editable del sitio.
 * Todo lo que se cambia sin tocar componentes vive aquí.
 * Los corchetes son placeholders honestos: se quedan hasta que exista el dato real.
 */

export const FIRMA = {
  nombre: "Dimia Consulting",
  dominio: "dimia.mx",
  correo: "hola@dimia.mx",
  telefono: "[ +52 55 0000 0000 ]",
  telefonoHref: "tel:+525500000000",
  linkedin: "https://www.linkedin.com/",
  ciudad: "Ciudad de México",
  anio: 2026,
} as const;

/**
 * Fondo del hero. En local se comparan con ?fondo=color|onda.
 *   color · cada celda recorre su ciclo, sin patrón
 *   onda  · las celdas se encienden en diagonal
 */
export const FONDO_HERO = "color" as const;

export const NAVEGACION = [
  { href: "#practica", texto: "Práctica" },
  { href: "#metodo", texto: "Método" },
  { href: "#productos", texto: "Productos" },
  { href: "#casos", texto: "Casos" },
  { href: "#firma", texto: "Firma" },
] as const;

export const HERO = {
  titular: "El punto donde el dato deja de informar y empieza a decidir.",
  bajadaAntes: "Diseñamos, construimos y ",
  bajadaFuerte: "operamos",
  bajadaDespues:
    " los sistemas con los que una empresa decide: datos confiables, inteligencia artificial aplicada, automatización y medición contra ingreso real.",
  ctaPrimario: "Agendar una demostración",
  ctaSecundario: "Ver cómo funciona",
  pie: "Datos · Inteligencia artificial · Automatización · Operación",
} as const;

export const LA_FIRMA = {
  rotulo: "La firma",
  entrada:
    "Contestamos lo que su negocio no alcanza a contestar: la pregunta operativa, la del tablero y la de la llamada de las nueve de la noche.",
  cuerpo:
    "Somos una consultora boutique. Trabajamos con dueños y directores de empresas mexicanas que ya tienen operación y datos, pero no un sistema que los use. Entramos por el problema, no por la herramienta, y nos quedamos operando lo que instalamos.",
  pilares: [
    {
      rotulo: "Diseñamos",
      texto: "Definimos qué decisión hay que resolver y con qué dato se sostiene.",
    },
    {
      rotulo: "Construimos",
      texto: "Bases, integraciones, automatizaciones y producto, en producción.",
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
export type Cliente = { nombre: string; logo: string | null };

export const MOSTRAR_CARRUSEL = true;

export const CLIENTES: Cliente[] = [
  // El logotipo se muestra en imagen cuando exista el archivo autorizado en
  // public/clientes/. Sin archivo, el carrusel escribe el nombre: se ve
  // deliberado, no roto.
  { nombre: "Arca Continental", logo: null },
  { nombre: "Heineken", logo: null },
  { nombre: "Atos", logo: null },
  { nombre: "Tecnológico de Monterrey", logo: null },
  { nombre: "Universidad Regiomontana", logo: null },
];

export const NOTA_CLIENTES =
  "Corporativos, universidades y negocios con operación telefónica. Cada logotipo se publica con autorización del cliente.";

export const PRODUCTO = {
  estado: "En operación",
  nombre: "Agente de voz Dimia",
  resumen:
    "Un número que contesta 24/7, entiende, agenda en firme y avisa por WhatsApp. La cita queda escrita antes de colgar.",
  fichas: [
    { rotulo: "Qué resuelve", valor: "La llamada que nadie alcanza a contestar", mono: false },
    { rotulo: "Para quién", valor: "Negocios con agenda y volumen telefónico", mono: false },
    { rotulo: "Integra con", valor: "Telefonía SIP · WhatsApp · Calendario · CRM", mono: true },
  ],
  cta: "Solicitar demostración",
} as const;

export const PROXIMOS = [
  { nombre: "[ Nombre del producto ]", estado: "Próximamente" },
  { nombre: "[ Nombre del producto ]", estado: "Próximamente" },
] as const;

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
    nota: "Se ofrece 17:45 en la misma llamada.",
  },
  cita: "«Automatización con garantía, no con buenas intenciones.»",
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
  titular: "Donde el dato decide.",
  notaTelefono: "Este número contesta con el agente de voz de Dimia.",
  declaracion: "Sistemas de decisión para empresas que ya no alcanzan a contestar.",
} as const;
