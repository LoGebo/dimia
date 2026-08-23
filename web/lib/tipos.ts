export type Vertical = string;
export type Herramienta = "agendar" | "pedido" | "recado";
export type TipoRegla = "disponible" | "bloqueo" | "festivo";
export type EstadoReserva = "confirmada" | "cancelada" | "no_asistio" | "completada";
export type EstadoPedido = "abierto" | "confirmado" | "cancelado" | "entregado";
export type TipoPedido = "recoger" | "domicilio" | "local";

export type Negocio = {
  id: string;
  nombre: string;
  vertical: Vertical;
  zona_horaria: string;
  telefono_entrada: string | null;
  telefono_escalamiento: string | null;
  voz_id: string | null;
  tts_proveedor: ProveedorTts;
  tts_ajustes: TtsAjustes;
  llm_proveedor: ProveedorLlm;
  llm_modelo: string | null;
  instrucciones_extra: string | null;
  slot_granularidad_min: number;
  anticipacion_min: number;
  horizonte_dias: number;
  activo: boolean;
};

export type Recurso = {
  id: string;
  nombre: string;
  capacidad: number;
  metadatos: Record<string, string>;
  activo: boolean;
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
  servicio: string;
  recurso: string;
  resource_id: string;
  service_id: string;
};

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

export const ETIQUETAS_RECURSO: Record<string, { recurso: string; ejemplos: string }> = {
  clinica: { recurso: "Doctor o consultorio", ejemplos: "Dra. Ana Ruiz, Dr. Luis Méndez" },
  restaurante: { recurso: "Mesa", ejemplos: "Mesa 1, Terraza 3" },
  comida: { recurso: "Estación de cocina", ejemplos: "Plancha, Trompo" },
  salon: { recurso: "Estación o estilista", ejemplos: "Silla 1, Karla" },
  taller: { recurso: "Bahía o técnico", ejemplos: "Bahía 1, Rampa 2" },
  inmobiliaria: { recurso: "Asesor", ejemplos: "Asesor Norte, Asesor Centro" },
  recepcion: { recurso: "Línea o agente", ejemplos: "Línea 1, Recepción" },
};

export function etiquetasRecurso(vertical: Vertical): { recurso: string; ejemplos: string } {
  return ETIQUETAS_RECURSO[vertical] ?? { recurso: "Recurso", ejemplos: "Sala A, Taller 1" };
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

export const PROVEEDORES_TTS: {
  valor: ProveedorTts;
  nombre: string;
  detalle: string;
  costoHora: number;
}[] = [
  { valor: "azure", nombre: "Azure Neural", detalle: "Catálogo mexicano y lo más barato", costoHora: 0.77 },
  { valor: "deepgram", nombre: "Deepgram Aura", detalle: "Latencia muy baja", costoHora: 1.44 },
  { valor: "cartesia", nombre: "Cartesia Sonic", detalle: "40 ms al primer audio", costoHora: 1.7 },
  { valor: "elevenlabs", nombre: "ElevenLabs", detalle: "La más natural, con más control", costoHora: 2.4 },
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
    { id: "gpt-4.1-mini", nombre: "GPT-4.1 mini", detalle: "El equilibrio de siempre", costoMinuto: 0.004 },
    { id: "gpt-4.1", nombre: "GPT-4.1", detalle: "Más fino, ocho veces más caro", costoMinuto: 0.032 },
  ],
  google: [
    { id: "gemini-3-flash-preview", nombre: "Gemini 3 Flash (preview)", detalle: "Probado en llamada real, muy conciso", costoMinuto: 0.005 },
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
