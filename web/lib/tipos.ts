export type Vertical = "clinica" | "restaurante" | "salon" | "generico";
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

export const VERTICALES: { valor: Vertical; etiqueta: string; recurso: string; ejemplos: string }[] = [
  { valor: "clinica", etiqueta: "Consultorio o clínica", recurso: "Doctor o consultorio", ejemplos: "Dra. Ana Ruiz, Dr. Luis Méndez" },
  { valor: "restaurante", etiqueta: "Restaurante", recurso: "Mesa", ejemplos: "Mesa 1, Terraza 3" },
  { valor: "salon", etiqueta: "Salón o barbería", recurso: "Estación o estilista", ejemplos: "Silla 1, Karla" },
  { valor: "generico", etiqueta: "Otro negocio con citas", recurso: "Recurso", ejemplos: "Taller 1, Sala A" },
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
