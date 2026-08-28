export type Vertical = string;
export type Herramienta = "agendar" | "pedido" | "recado";
export type TipoRegla = "disponible" | "bloqueo" | "festivo";
export const TIPOS_REGLA: TipoRegla[] = ["disponible", "bloqueo", "festivo"];
export type EstadoReserva = "confirmada" | "cancelada" | "no_asistio" | "completada";
export type EstadoPedido = "abierto" | "confirmado" | "cancelado" | "entregado";
export const ESTADOS_PEDIDO: EstadoPedido[] = ["abierto", "confirmado", "cancelado", "entregado"];
export type TipoPedido = "recoger" | "domicilio" | "local";

export type Negocio = {
  id: string;
  nombre: string;
  vertical: Vertical;
  zona_horaria: string;
  telefono_entrada: string | null;
  telefono_escalamiento: string | null;
  instagram_id: string | null;
  messenger_page_id: string | null;
  voz_id: string | null;
  tts_proveedor: ProveedorTts;
  tts_ajustes: TtsAjustes;
  llm_proveedor: ProveedorLlm;
  llm_modelo: string | null;
  instrucciones_extra: string | null;
  prompt_base: string | null;
  tipos_catalogo: string[];
  pago_proveedor: string;
  resena_activa: boolean;
  resena_url: string | null;
  resena_espera_min: number;
  saludo: string | null;
  slot_granularidad_min: number;
  anticipacion_min: number;
  horizonte_dias: number;
  activo: boolean;
};

export type TipoRecurso = "lugar" | "persona";

export type Recurso = {
  id: string;
  nombre: string;
  tipo: TipoRecurso;
  capacidad: number;
  telefono: string | null;
  correo: string | null;
  comision_pct: string | null;
  metadatos: Record<string, string>;
  activo: boolean;
};

export type Productividad = {
  resource_id: string;
  nombre: string;
  tipo: TipoRecurso;
  comision_pct: string | null;
  citas: number;
  atendidas: number;
  no_asistio: number;
  cobrado: string;
  comision: string;
};

export type Ausencia = {
  id: string;
  resource_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string | null;
};

export type Servicio = {
  id: string;
  nombre: string;
  alias: string[];
  duracion_min: number;
  buffer_min: number;
  precio: string | null;
  recursos_validos: string[];
  activo: boolean;
};

export type Regla = {
  id: string;
  resource_id: string | null;
  tipo: TipoRegla;
  dia_semana: number | null;
  fecha: string | null;
  hora_inicio: string;
  hora_fin: string;
};

export type Reserva = {
  id: string;
  codigo: string;
  cliente_nombre: string;
  telefono: string;
  personas: number;
  notas: string | null;
  inicio: string;
  fin: string;
  estado: EstadoReserva;
  llegada: string | null;
  cliente_id: string | null;
  creado: string;
  precio: string | null;
  servicio: string;
  recurso: string;
  resource_id: string;
  service_id: string;
  /** Lo pagado por esta cita, o null si no se ha cobrado. */
  cobrado: string | null;
};

/** En qué columna del día va una cita. Se deriva de `estado` y `llegada`. */
export type PasoCita = "por_llegar" | "en_atencion" | "atendida" | "no_llego" | "cancelada";

export function pasoDe(r: Pick<Reserva, "estado" | "llegada">): PasoCita {
  if (r.estado === "completada") return "atendida";
  if (r.estado === "no_asistio") return "no_llego";
  if (r.estado === "cancelada") return "cancelada";
  return r.llegada ? "en_atencion" : "por_llegar";
}

export type ResumenCitas = { citas: Reserva[]; atendidas: number; enAtencion: Reserva[]; porLlegar: Reserva[] };

/** Las cuentas del día que comparten Hoy y la Agenda: mismas reglas, un solo lugar. */
export function resumenCitas(reservas: Reserva[]): ResumenCitas {
  return {
    citas: reservas.filter((r) => r.estado === "confirmada" || r.estado === "completada"),
    atendidas: reservas.filter((r) => r.estado === "completada").length,
    enAtencion: reservas.filter((r) => pasoDe(r) === "en_atencion"),
    porLlegar: reservas
      .filter((r) => pasoDe(r) === "por_llegar")
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
  };
}

export type Faq = {
  id: string;
  pregunta: string;
  respuesta: string;
  prioridad: number;
};

export type PedidoItem = {
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
  notas: string | null;
};

export type Pedido = {
  id: string;
  codigo: string;
  cliente_nombre: string | null;
  telefono: string;
  tipo: TipoPedido;
  direccion: string | null;
  notas: string | null;
  estado: EstadoPedido;
  creado: string;
  listo_para: string | null;
  total: string;
  items: PedidoItem[];
};

export type ResumenPedidos = {
  total: number;
  abiertos: number;
  confirmados: number;
  entregados: number;
  cancelados: number;
  vendido: number;
  ticket: number | null;
};

export function resumirPedidos(pedidos: Pedido[]): ResumenPedidos {
  const cuenta = (estado: EstadoPedido) => pedidos.filter((p) => p.estado === estado).length;
  const vendidos = pedidos.filter((p) => p.estado === "confirmado" || p.estado === "entregado");
  const vendido = vendidos.reduce((s, p) => s + Number(p.total), 0);
  return {
    total: pedidos.length,
    abiertos: cuenta("abierto"),
    confirmados: cuenta("confirmado"),
    entregados: cuenta("entregado"),
    cancelados: cuenta("cancelado"),
    vendido,
    ticket: vendidos.length > 0 ? vendido / vendidos.length : null,
  };
}

export type ResumenPedidoPrueba = {
  id: string;
  codigo: string;
  estado: string;
  tipo: string;
  total: string;
  items: PedidoItem[];
};

export type LlamadaPrueba = {
  call_id: string;
  inicio: string;
  duracion_seg: number | null;
  resuelto: boolean | null;
  escalado: boolean;
  motivo_escalamiento: string | null;
};

export type EstadoPrueba = {
  pedido: ResumenPedidoPrueba | null;
  reservas: {
    id: string;
    codigo: string;
    cliente_nombre: string;
    inicio: string;
    servicio: string;
    recurso: string;
    personas: number;
  }[];
  llamadas: LlamadaPrueba[];
};

export type Recado = {
  id: string;
  nombre: string | null;
  telefono: string;
  asunto: string;
  detalle: string | null;
  campos: Record<string, unknown>;
  atendido: boolean;
  creado: string;
};

export type Cliente = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  origen: string | null;
  etiquetas: string[];
  primer_contacto: string;
  ultimo_contacto: string;
};

export type ClienteResumen = Cliente & {
  citas: number;
  atendidas: number;
  no_asistio: number;
  pedidos: number;
  gastado: string;
  recados_pendientes: number;
};

export type Evento = {
  id: number;
  cliente_id: string | null;
  tipo: string;
  entidad: string;
  entidad_id: string | null;
  datos: Record<string, unknown>;
  autor: "agente" | "equipo" | "cliente" | "sistema";
  creado: string;
};

export const NOMBRE_EVENTO: Record<string, string> = {
  "cita.creada": "Agendó una cita",
  "cita.confirmada": "Cita confirmada",
  "cita.cancelada": "Canceló la cita",
  "cita.atendida": "Cita atendida",
  "cita.no_asistio": "No llegó a la cita",
  "cita.llegada": "Llegó a la cita",
  "cita.movida": "Movió la cita",
  "pedido.abierto": "Empezó un pedido",
  "pedido.confirmado": "Pedido a cocina",
  "pedido.entregado": "Pedido entregado",
  "pedido.cancelado": "Pedido cancelado",
  "recado.creado": "Dejó un recado",
  "recado.atendido": "Recado atendido",
  "conversacion.abierta": "Empezó a escribir",
  "conversacion.escalada": "Pidió una persona",
  "conversacion.cerrada": "Conversación cerrada",
  "llamada.terminada": "Llamó",
  "llamada.resumida": "Cierre de la llamada",
  "conversacion.resumida": "Cierre de la conversación",
  "pago.registrado": "Pagó",
  "pago.pendiente": "Cobro pendiente",
  "pago.cancelado": "Cobro cancelado",
  "pago.reembolsado": "Reembolso",
  "campana.enviado": "Le mandamos un mensaje",
  "campana.en_curso": "Le estamos marcando",
  "campana.contestado": "Contestó a la campaña",
  "campana.agendo": "Agendó por la campaña",
  "campana.sin_respuesta": "No contestó la campaña",
  "campana.rechazo": "Pidió que no le llamen",
  "campana.fallido": "No se pudo contactar",
  "resena.recibida": "Dejó una calificación",
};

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "enlace" | "otro";
export type EstadoPago = "pendiente" | "pagado" | "cancelado" | "reembolsado";

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  enlace: "Enlace de pago",
  otro: "Otro",
};

export type Pago = {
  id: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  booking_id: string | null;
  pedido_id: string | null;
  concepto: string;
  monto: string;
  metodo: MetodoPago;
  estado: EstadoPago;
  proveedor: string | null;
  enlace_url: string | null;
  referencia_externa: string | null;
  notas: string | null;
  pagado_en: string | null;
  creado: string;
};

export type TipoCampana = "no_show" | "inactivos" | "recordatorio_pago" | "resena" | "marketing" | "manual";
export type CanalCampana = "whatsapp" | "llamada";
export type EstadoCampana = "borrador" | "activa" | "pausada" | "terminada";
export type EstadoContacto =
  | "pendiente" | "en_curso" | "enviado" | "contestado" | "agendo" | "sin_respuesta" | "rechazo" | "fallido" | "excluido";

export const NOMBRE_TIPO_CAMPANA: Record<TipoCampana, { nombre: string; detalle: string }> = {
  no_show: { nombre: "Recuperar a quien faltó", detalle: "Personas con una cita a la que no llegaron y sin cita futura." },
  inactivos: { nombre: "Traer de vuelta a inactivos", detalle: "Clientes atendidos antes que no han vuelto en N días." },
  recordatorio_pago: { nombre: "Recordar un pago", detalle: "Clientes con un cobro pendiente." },
  resena: { nombre: "Pedir reseña", detalle: "Después de una cita atendida." },
  marketing: { nombre: "Promoción", detalle: "Un mensaje a una lista que tú eliges." },
  manual: { nombre: "Lista propia", detalle: "Tú eliges a quién." },
};

export const NOMBRE_ESTADO_CONTACTO: Record<EstadoContacto, string> = {
  pendiente: "Por contactar",
  en_curso: "En curso",
  enviado: "Enviado",
  contestado: "Contestó",
  agendo: "Agendó",
  sin_respuesta: "Sin respuesta",
  rechazo: "No quiere",
  fallido: "Falló",
  excluido: "Excluido",
};

export type Campana = {
  id: string;
  nombre: string;
  tipo: TipoCampana;
  canal: CanalCampana;
  estado: EstadoCampana;
  criterio: { dias?: number };
  mensaje: string;
  objetivo: string | null;
  ventana_inicio: string;
  ventana_fin: string;
  max_intentos: number;
  creado: string;
  total: number;
  pendientes: number;
  enviados: number;
  contestados: number;
  agendaron: number;
  sin_respuesta: number;
  fallidos: number;
};

export type CampanaContacto = {
  id: string;
  cliente_id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  estado: EstadoContacto;
  intentos: number;
  ultimo_intento: string | null;
  siguiente_intento: string;
  resultado: string | null;
  booking_id: string | null;
};

export type ResenaResumen = { resource_id: string | null; nombre: string; total: number; promedio: string; bajas: number };
export type OrigenResumen = { origen: string; clientes: number; citas: number; cobrado: string };
export type Linea = { id: string; telefono: string; etiqueta: string; campana_id: string | null; activo: boolean };

export type Rol = "owner" | "staff";

export type Membresia = {
  tenant_id: string;
  nombre: string;
  vertical: Vertical;
  vertical_nombre: string;
  herramientas: Herramienta[];
  rol: Rol;
};

export type ProveedorTts = "azure" | "elevenlabs" | "deepgram" | "cartesia";
export type ProveedorLlm = "openai" | "google" | "anthropic";

export type TtsAjustes = {
  estabilidad?: number;
  similitud?: number;
  estilo?: number | string;
  velocidad?: number;
  prosodia?: { rate?: number | string };
  intensidad?: number;
  modelo?: string;
};

export type PlantillaVertical = {
  clave: string;
  nombre: string;
  saludo: string;
  instrucciones: string;
  herramientas: Herramienta[];
};

export type CatalogoItem = {
  id: string;
  tipo: string;
  nombre: string;
  descripcion: string | null;
  precio: string | null;
  alias: string[];
  atributos: Record<string, unknown>;
  resource_id: string | null;
  disponible: boolean;
  existencias: number | null;
  orden: number;
};

export type ResultadoCatalogo = {
  id: string;
  tipo: string;
  nombre: string;
  descripcion: string | null;
  precio: string | null;
  atributos: Record<string, unknown>;
  resource_id: string | null;
  puntaje: number;
};

export type CampoAtributo =
  | { clave: string; etiqueta: string; tipo: "texto"; ayuda?: string }
  | { clave: string; etiqueta: string; tipo: "numero"; ayuda?: string }
  | { clave: string; etiqueta: string; tipo: "booleano"; ayuda?: string }
  | { clave: string; etiqueta: string; tipo: "opcion"; opciones: string[]; ayuda?: string }
  | { clave: string; etiqueta: string; tipo: "multiple"; opciones: string[]; ayuda?: string };

export const ESQUEMAS_ATRIBUTOS: Record<string, CampoAtributo[]> = {
  platillo: [
    {
      clave: "alergenos",
      etiqueta: "Alérgenos",
      tipo: "multiple",
      opciones: ["gluten", "lacteos", "huevo", "pescado", "mariscos", "frutos secos", "soya", "ajonjoli"],
      ayuda: "El agente nunca asegura que algo es seguro: avisa y transfiere.",
    },
    { clave: "vegetariano", etiqueta: "Vegetariano", tipo: "booleano" },
    { clave: "vegano", etiqueta: "Vegano", tipo: "booleano" },
    { clave: "picante", etiqueta: "Picante", tipo: "opcion", opciones: ["no", "bajo", "medio", "alto"] },
  ],
  bebida: [
    { clave: "alcohol", etiqueta: "Con alcohol", tipo: "booleano" },
    { clave: "sin_azucar", etiqueta: "Sin azúcar", tipo: "booleano" },
  ],
  taco: [
    { clave: "picante", etiqueta: "Picante", tipo: "opcion", opciones: ["no", "bajo", "medio", "alto"] },
    { clave: "vegetariano", etiqueta: "Vegetariano", tipo: "booleano" },
  ],
  especialidad: [
    {
      clave: "alergenos",
      etiqueta: "Alérgenos",
      tipo: "multiple",
      opciones: ["gluten", "lacteos", "huevo", "pescado", "mariscos", "frutos secos", "soya", "ajonjoli"],
    },
    { clave: "picante", etiqueta: "Picante", tipo: "opcion", opciones: ["no", "bajo", "medio", "alto"] },
    { clave: "vegetariano", etiqueta: "Vegetariano", tipo: "booleano" },
  ],
  profesional: [
    { clave: "especialidad", etiqueta: "Especialidad", tipo: "texto" },
    { clave: "cedula", etiqueta: "Cédula profesional", tipo: "texto" },
    { clave: "atiende_ninos", etiqueta: "Atiende niños", tipo: "booleano" },
    { clave: "idiomas", etiqueta: "Idiomas", tipo: "multiple", opciones: ["espanol", "ingles"] },
  ],
  propiedad: [
    { clave: "operacion", etiqueta: "Operación", tipo: "opcion", opciones: ["venta", "renta"] },
    { clave: "recamaras", etiqueta: "Recámaras", tipo: "numero" },
    { clave: "banos", etiqueta: "Baños", tipo: "numero" },
    { clave: "metros", etiqueta: "Metros cuadrados", tipo: "numero" },
    { clave: "estacionamiento", etiqueta: "Estacionamiento", tipo: "booleano" },
  ],
  refaccion: [
    { clave: "marca", etiqueta: "Marca", tipo: "texto" },
    { clave: "modelo", etiqueta: "Modelo compatible", tipo: "texto" },
    { clave: "garantia_meses", etiqueta: "Garantía (meses)", tipo: "numero" },
    { clave: "en_existencia", etiqueta: "En existencia", tipo: "booleano" },
  ],
  paquete: [
    { clave: "incluye", etiqueta: "Qué incluye", tipo: "texto" },
    { clave: "vigencia", etiqueta: "Vigencia", tipo: "texto" },
  ],
};

export const TIPOS_POR_VERTICAL: Record<string, string[]> = {
  restaurante: ["platillo", "bebida"],
  comida: ["taco", "especialidad", "bebida", "extra", "postre"],
  clinica: ["profesional", "paquete"],
  salon: ["profesional", "paquete"],
  taller: ["refaccion", "paquete"],
  inmobiliaria: ["propiedad"],
  recepcion: ["paquete"],
};

export const ETIQUETAS_TIPO: Record<string, { singular: string; plural: string }> = {
  platillo: { singular: "Platillo", plural: "Platillos" },
  taco: { singular: "Taco", plural: "Tacos" },
  especialidad: { singular: "Especialidad", plural: "Especialidades" },
  extra: { singular: "Extra", plural: "Extras" },
  postre: { singular: "Postre", plural: "Postres" },
  bebida: { singular: "Bebida", plural: "Bebidas" },
  profesional: { singular: "Profesional", plural: "Profesionales" },
  propiedad: { singular: "Propiedad", plural: "Propiedades" },
  refaccion: { singular: "Refacción", plural: "Refacciones" },
  paquete: { singular: "Paquete", plural: "Paquetes" },
};

export function etiquetaTipo(tipo: string, plural = false): string {
  const conocida = ETIQUETAS_TIPO[tipo];
  if (conocida) return plural ? conocida.plural : conocida.singular;
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

export type EtiquetasRecurso = { recurso: string; plural: string; ejemplos: string };

export const ETIQUETAS_RECURSO: Record<string, EtiquetasRecurso> = {
  clinica: { recurso: "Doctor o consultorio", plural: "Consultorios", ejemplos: "Dra. Ana Ruiz, Dr. Luis Méndez" },
  restaurante: { recurso: "Mesa", plural: "Mesas", ejemplos: "Mesa 1, Terraza 3" },
  comida: { recurso: "Estación de cocina", plural: "Estaciones", ejemplos: "Plancha, Trompo" },
  salon: { recurso: "Estación o estilista", plural: "Estaciones", ejemplos: "Silla 1, Karla" },
  taller: { recurso: "Bahía o técnico", plural: "Bahías", ejemplos: "Bahía 1, Rampa 2" },
  inmobiliaria: { recurso: "Asesor", plural: "Asesores", ejemplos: "Asesor Norte, Asesor Centro" },
  recepcion: { recurso: "Línea o agente", plural: "Líneas", ejemplos: "Línea 1, Recepción" },
};

export function etiquetasRecurso(vertical: Vertical): EtiquetasRecurso {
  return ETIQUETAS_RECURSO[vertical] ?? { recurso: "Recurso", plural: "Recursos", ejemplos: "Sala A, Taller 1" };
}

export type ClaveDeslizador = "estabilidad" | "similitud" | "estilo" | "velocidad";

export type CampoDeslizador = {
  clave: ClaveDeslizador;
  etiqueta: string;
  ayuda: string;
  min: number;
  max: number;
  paso: number;
  porDefecto: number;
};

export const AJUSTES_ELEVENLABS: CampoDeslizador[] = [
  { clave: "estabilidad", etiqueta: "Estabilidad", ayuda: "Bajo varía más la entonación; alto suena parejo y plano.", min: 0, max: 1, paso: 0.05, porDefecto: 0.45 },
  { clave: "similitud", etiqueta: "Similitud", ayuda: "Qué tanto se apega a la voz original.", min: 0, max: 1, paso: 0.05, porDefecto: 0.8 },
  { clave: "estilo", etiqueta: "Estilo", ayuda: "Exagera el acento y la intención. Sube la latencia.", min: 0, max: 1, paso: 0.05, porDefecto: 0.15 },
  { clave: "velocidad", etiqueta: "Velocidad", ayuda: "1.0 es el ritmo natural.", min: 0.7, max: 1.2, paso: 0.05, porDefecto: 1 },
];

export const VELOCIDAD_AZURE = { min: 0.5, max: 2, paso: 0.01, porDefecto: 1 } as const;

export const MODELOS_ELEVENLABS: { id: string; nombre: string; detalle: string }[] = [
  { id: "eleven_v3_conversational", nombre: "v3 conversacional", detalle: "La más natural en tiempo real. ~280 ms al primer audio." },
  { id: "eleven_flash_v2_5", nombre: "Flash v2.5", detalle: "La más rápida. ~75 ms al primer audio, un poco más plana." },
];

export const PROVEEDORES_TTS: {
  valor: ProveedorTts;
  nombre: string;
  detalle: string;
  costoHora: number;
}[] = [
  { valor: "azure", nombre: "Azure Neural", detalle: "Catálogo mexicano y lo más barato", costoHora: 0.77 },
  { valor: "deepgram", nombre: "Deepgram Aura", detalle: "Latencia muy baja", costoHora: 1.44 },
  { valor: "cartesia", nombre: "Cartesia Sonic", detalle: "40 ms al primer audio", costoHora: 1.7 },
  { valor: "elevenlabs", nombre: "ElevenLabs", detalle: "La más natural: v3 conversacional al precio de Flash", costoHora: 2.4 },
];

export const VOCES_AZURE: { id: string; nombre: string; detalle: string }[] = [
  { id: "es-MX-DaliaNeural", nombre: "Dalia", detalle: "Femenina, cálida y neutra" },
  { id: "es-MX-JorgeNeural", nombre: "Jorge", detalle: "Masculina, formal" },
  { id: "es-MX-BeatrizNeural", nombre: "Beatriz", detalle: "Femenina, madura" },
  { id: "es-MX-CandelaNeural", nombre: "Candela", detalle: "Femenina, enérgica" },
  { id: "es-MX-CarlotaNeural", nombre: "Carlota", detalle: "Femenina, serena" },
  { id: "es-MX-CecilioNeural", nombre: "Cecilio", detalle: "Masculina, grave" },
  { id: "es-MX-GerardoNeural", nombre: "Gerardo", detalle: "Masculina, cercana" },
  { id: "es-MX-LarissaNeural", nombre: "Larissa", detalle: "Femenina, joven" },
];

export const FORMATO_VOZ: Record<ProveedorTts, { formato: string; ejemplo: string; donde: string }> = {
  azure: {
    formato: "idioma-REGION-NombreNeural",
    ejemplo: "es-MX-JorgeNeural",
    donde: "Azure Speech Studio, en la galería de voces.",
  },
  elevenlabs: {
    formato: "20 caracteres alfanuméricos",
    ejemplo: "MOpELGWw8bqcERsmVMzW",
    donde: "ElevenLabs, en la voz → Voice ID.",
  },
  deepgram: {
    formato: "aura-2-nombre-idioma",
    ejemplo: "aura-2-javier-es",
    donde: "Deepgram, en la lista de modelos Aura.",
  },
  cartesia: {
    formato: "uuid de 36 caracteres",
    ejemplo: "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c",
    donde: "Cartesia, en la voz → Copy ID.",
  },
};

const UUID = /^[0-9a-f-]{36}$/;

export function vozValida(proveedor: ProveedorTts, vozId: string): boolean {
  if (proveedor === "azure") return /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(vozId);
  if (proveedor === "deepgram") return /^aura(-2)?-[a-z]+-[a-z]{2}$/.test(vozId);
  if (proveedor === "cartesia") return UUID.test(vozId);
  return !UUID.test(vozId);
}

export function nombreVoz(proveedor: ProveedorTts, vozId: string | null): string {
  if (!vozId) return "voz por defecto";
  if (proveedor === "azure") {
    return VOCES_AZURE.find((v) => v.id === vozId)?.nombre ?? vozId.replace(/^es-MX-|Neural$/g, "");
  }
  if (proveedor === "deepgram") {
    const partes = vozId.split("-");
    const nombre = partes[partes.length - 2] ?? vozId;
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }
  return `${vozId.slice(0, 6)}…`;
}

export function nombreProveedorTts(proveedor: ProveedorTts): string {
  return PROVEEDORES_TTS.find((p) => p.valor === proveedor)?.nombre ?? proveedor;
}

export const PROVEEDORES_LLM: {
  valor: ProveedorLlm;
  nombre: string;
  detalle: string;
  porDefecto: string;
}[] = [
  { valor: "openai", nombre: "OpenAI", detalle: "El más probado en llamadas", porDefecto: "gpt-4.1-mini" },
  { valor: "google", nombre: "Google Gemini", detalle: "El más rápido y barato", porDefecto: "gemini-2.5-flash" },
  { valor: "anthropic", nombre: "Anthropic", detalle: "El que mejor sigue instrucciones largas", porDefecto: "claude-haiku-4-5-20251001" },
];

export const MODELOS_LLM: Record<
  ProveedorLlm,
  { id: string; nombre: string; detalle: string; costoMinuto: number }[]
> = {
  openai: [
    { id: "gpt-4.1-nano", nombre: "GPT-4.1 nano", detalle: "El más rápido y barato; sigue peor instrucciones largas", costoMinuto: 0.001 },
    { id: "gpt-4.1-mini", nombre: "GPT-4.1 mini", detalle: "El equilibrio de siempre", costoMinuto: 0.004 },
    { id: "gpt-4.1", nombre: "GPT-4.1", detalle: "Más fino, ocho veces más caro", costoMinuto: 0.032 },
  ],
  google: [
    { id: "gemini-2.5-flash", nombre: "Gemini 2.5 Flash", detalle: "El mejor equilibrio velocidad, costo y herramientas", costoMinuto: 0.003 },
    { id: "gemini-2.5-flash-lite", nombre: "Gemini 2.5 Flash-Lite", detalle: "El de menor latencia del mercado; algo más simple", costoMinuto: 0.001 },
    { id: "gemini-3-flash-preview", nombre: "Gemini 3 Flash (preview)", detalle: "Muy conciso, pero da 504 seguido: no lo dejes en producción", costoMinuto: 0.005 },
  ],
  anthropic: [
    { id: "claude-haiku-4-5-20251001", nombre: "Claude Haiku 4.5", detalle: "Rápido y muy obediente", costoMinuto: 0.004 },
  ],
};

export function modeloPorDefecto(proveedor: ProveedorLlm): string {
  return PROVEEDORES_LLM.find((p) => p.valor === proveedor)?.porDefecto ?? "";
}

export function nombreModelo(proveedor: ProveedorLlm, modelo: string | null): string {
  const id = modelo || modeloPorDefecto(proveedor);
  return MODELOS_LLM[proveedor].find((m) => m.id === id)?.nombre ?? id;
}

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const ZONAS_HORARIAS = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Monterrey",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Tijuana",
] as const;

export type CanalConversacion = "whatsapp" | "llamada" | "instagram" | "messenger" | "sms";
export type EstadoConversacion = "abierta" | "escalada" | "cerrada";
export type AutorMensaje = "cliente" | "agente" | "equipo" | "sistema";

export const NOMBRE_CANAL: Record<CanalConversacion, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  instagram: "Instagram",
  messenger: "Messenger",
  sms: "SMS",
};

export type ResultadoContacto =
  | "cita" | "cambio_cita" | "cancelacion" | "pedido" | "recado" | "informacion" | "transferida" | "sin_resultado";

export const NOMBRE_RESULTADO: Record<ResultadoContacto, string> = {
  cita: "Agendó",
  cambio_cita: "Cambió su cita",
  cancelacion: "Canceló",
  pedido: "Pidió",
  recado: "Dejó recado",
  informacion: "Solo preguntó",
  transferida: "Pasó a una persona",
  sin_resultado: "Sin resultado",
};

export type Conversacion = {
  id: string;
  canal: CanalConversacion;
  contacto: string;
  contacto_nombre: string | null;
  cliente_id: string | null;
  estado: EstadoConversacion;
  escalada_en: string | null;
  motivo_escalamiento: string | null;
  motivo: string | null;
  resultado: ResultadoContacto | null;
  resumen: string | null;
  ultimo_mensaje: string | null;
  ultimo_mensaje_en: string;
  mensajes_sin_leer: number;
  booking_id: string | null;
  pedido_id: string | null;
  call_id: string | null;
};

/** La conversación abierta en el hilo, con lo justo para enlazar a la cita o al pedido que salió de ella. */
export type ConversacionDetalle = Conversacion & {
  booking_codigo: string | null;
  booking_inicio: string | null;
  pedido_creado: string | null;
};

export type Mensaje = {
  id: string;
  autor: AutorMensaje;
  texto: string;
  herramienta: string | null;
  creado: string;
};

export type PlantillaMensaje = "confirmacion" | "cancelacion" | "recordatorio" | "pedido";
export type EstadoEnvio = "pendiente" | "enviado" | "fallido";

export const NOMBRE_PLANTILLA: Record<PlantillaMensaje, string> = {
  pedido: "Confirmación de pedido",
  confirmacion: "Confirmación de cita",
  recordatorio: "Recordatorio de cita",
  cancelacion: "Cancelación",
};

export type MensajeSaliente = {
  id: string;
  canal: string;
  destino: string;
  plantilla: PlantillaMensaje;
  estado: EstadoEnvio;
  intentos: number;
  max_intentos: number;
  ultimo_error: string | null;
  disponible_en: string;
  creado: string;
  enviado: string | null;
};
