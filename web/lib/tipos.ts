export type Vertical = string;
export type TipoRegla = "disponible" | "bloqueo" | "festivo";
export type EstadoReserva = "confirmada" | "cancelada" | "no_asistio" | "completada";

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

export type Rol = "owner" | "staff";

export type Membresia = {
  tenant_id: string;
  nombre: string;
  vertical: Vertical;
  rol: Rol;
};

export type ProveedorTts = "elevenlabs" | "cartesia";

export type TtsAjustes = {
  estabilidad?: number;
  similitud?: number;
  estilo?: number;
  velocidad?: number;
};

export type PlantillaVertical = {
  clave: string;
  nombre: string;
  saludo: string;
  instrucciones: string;
  herramientas: string[];
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
  clinica: ["profesional", "paquete"],
  salon: ["profesional", "paquete"],
  taller: ["refaccion", "paquete"],
  inmobiliaria: ["propiedad"],
  recepcion: ["paquete"],
};

export const ETIQUETAS_TIPO: Record<string, { singular: string; plural: string }> = {
  platillo: { singular: "Platillo", plural: "Platillos" },
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
  salon: { recurso: "Estación o estilista", ejemplos: "Silla 1, Karla" },
  taller: { recurso: "Bahía o técnico", ejemplos: "Bahía 1, Rampa 2" },
  inmobiliaria: { recurso: "Asesor", ejemplos: "Asesor Norte, Asesor Centro" },
  recepcion: { recurso: "Línea o agente", ejemplos: "Línea 1, Recepción" },
};

export function etiquetasRecurso(vertical: Vertical): { recurso: string; ejemplos: string } {
  return ETIQUETAS_RECURSO[vertical] ?? { recurso: "Recurso", ejemplos: "Sala A, Taller 1" };
}

export const AJUSTES_TTS: Record<
  ProveedorTts,
  { clave: keyof TtsAjustes; etiqueta: string; ayuda: string; min: number; max: number; paso: number; porDefecto: number }[]
> = {
  elevenlabs: [
    { clave: "estabilidad", etiqueta: "Estabilidad", ayuda: "Bajo varía más la entonación; alto suena parejo y plano.", min: 0, max: 1, paso: 0.05, porDefecto: 0.5 },
    { clave: "similitud", etiqueta: "Similitud", ayuda: "Qué tanto se apega a la voz original.", min: 0, max: 1, paso: 0.05, porDefecto: 0.75 },
    { clave: "estilo", etiqueta: "Estilo", ayuda: "Exagera el acento y la intención. Sube la latencia.", min: 0, max: 1, paso: 0.05, porDefecto: 0 },
    { clave: "velocidad", etiqueta: "Velocidad", ayuda: "1.0 es el ritmo natural.", min: 0.7, max: 1.2, paso: 0.05, porDefecto: 1 },
  ],
  cartesia: [
    { clave: "velocidad", etiqueta: "Velocidad", ayuda: "1.0 es el ritmo natural.", min: 0.7, max: 1.2, paso: 0.05, porDefecto: 1 },
    { clave: "estilo", etiqueta: "Emoción", ayuda: "Qué tanta carga emocional le pone.", min: 0, max: 1, paso: 0.05, porDefecto: 0.3 },
  ],
};

export const PROVEEDORES_TTS: { valor: ProveedorTts; nombre: string; detalle: string }[] = [
  { valor: "elevenlabs", nombre: "ElevenLabs", detalle: "Más natural, más control" },
  { valor: "cartesia", nombre: "Cartesia Sonic", detalle: "40 ms al primer audio" },
];

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

export const VOCES = [
  { id: "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c", nombre: "Daniela", detalle: "Femenina, neutra mexicana" },
  { id: "846d6cb0-2301-48b6-9683-48f5618ea2f6", nombre: "Mariana", detalle: "Femenina, cálida" },
  { id: "2deb56b5-0e0a-4ee5-9f77-4a1e6d1f5b4a", nombre: "Sebastián", detalle: "Masculina, formal" },
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", nombre: "Rodrigo", detalle: "Masculina, joven" },
] as const;
