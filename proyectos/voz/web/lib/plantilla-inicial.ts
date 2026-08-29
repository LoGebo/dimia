import "server-only";

import type { Consulta } from "@/lib/db";

/**
 * Lo que un negocio recibe ya capturado al darse de alta.
 *
 * La idea es simple: editar es mucho más fácil que crear desde cero. En vez de
 * una pantalla en blanco, el dueño ve lo típico de su giro, lo corrige y sigue.
 * Todo entra marcado como `sugerido` para que la interfaz lo señale.
 */

type Plantilla = {
  recursos: { nombre: string; capacidad: number }[];
  servicios: { nombre: string; duracion: number; precio: number | null; alias: string[] }[];
  faq: { pregunta: string; respuesta: string }[];
  /** Franja de lunes a viernes; los sábados se ponen aparte. */
  horario: { dias: number[]; abre: string; cierra: string }[];
};

const GENERICA: Plantilla = {
  recursos: [{ nombre: "Recurso 1", capacidad: 1 }],
  servicios: [{ nombre: "Cita", duracion: 30, precio: null, alias: [] }],
  faq: [
    { pregunta: "¿Dónde están?", respuesta: "[ Dirección del negocio ]" },
    { pregunta: "¿Qué formas de pago aceptan?", respuesta: "[ Efectivo, tarjeta, transferencia ]" },
    { pregunta: "¿Tienen estacionamiento?", respuesta: "[ Sí o no, y dónde ]" },
  ],
  horario: [{ dias: [1, 2, 3, 4, 5], abre: "09:00", cierra: "18:00" }],
};

const PLANTILLAS: Record<string, Plantilla> = {
  consultora: {
    recursos: [
      { nombre: "Asesor 1", capacidad: 1 },
      { nombre: "Asesor 2", capacidad: 1 },
    ],
    servicios: [
      { nombre: "Demostración", duracion: 30, precio: null, alias: ["demo", "presentación", "conocer el servicio"] },
      { nombre: "Sesión de arranque", duracion: 60, precio: null, alias: ["onboarding", "configuración", "arranque"] },
      { nombre: "Soporte", duracion: 30, precio: null, alias: ["ayuda", "duda", "revisión"] },
    ],
    faq: [
      { pregunta: "¿Qué hacen exactamente?", respuesta: "[ Qué vende la consultora, en dos frases ]" },
      { pregunta: "¿Cuánto cuesta?", respuesta: "[ Planes y desde cuánto; si depende, decir que la demo lo aclara ]" },
      { pregunta: "¿Cómo empiezo?", respuesta: "[ Pasos: demo, alta, arranque ]" },
      { pregunta: "¿Cómo pago?", respuesta: "[ Transferencia, tarjeta, enlace de pago ]" },
      { pregunta: "¿Dónde están?", respuesta: "[ Ciudad; si es remoto, decirlo ]" },
    ],
    horario: [{ dias: [1, 2, 3, 4, 5], abre: "09:00", cierra: "18:00" }],
  },
  clinica: {
    recursos: [
      { nombre: "Consultorio 1", capacidad: 1 },
      { nombre: "Consultorio 2", capacidad: 1 },
    ],
    servicios: [
      { nombre: "Consulta general", duracion: 30, precio: 600, alias: ["consulta", "revisión"] },
      { nombre: "Limpieza dental", duracion: 45, precio: 800, alias: ["limpieza", "profilaxis"] },
      { nombre: "Primera vez", duracion: 60, precio: 900, alias: ["valoración", "primera cita"] },
    ],
    faq: [
      { pregunta: "¿Dónde están?", respuesta: "[ Dirección del consultorio ]" },
      { pregunta: "¿Qué formas de pago aceptan?", respuesta: "[ Efectivo, tarjeta, transferencia ]" },
      { pregunta: "¿Atienden urgencias?", respuesta: "[ Sí o no, y en qué horario ]" },
      { pregunta: "¿Trabajan con aseguradoras?", respuesta: "[ Cuáles, o ninguna ]" },
    ],
    horario: [{ dias: [1, 2, 3, 4, 5], abre: "09:00", cierra: "19:00" }],
  },
  salon: {
    recursos: [
      { nombre: "Estación 1", capacidad: 1 },
      { nombre: "Estación 2", capacidad: 1 },
    ],
    servicios: [
      { nombre: "Corte", duracion: 45, precio: 350, alias: ["corte de cabello"] },
      { nombre: "Tinte", duracion: 120, precio: 1200, alias: ["color", "tinte de raíz"] },
      { nombre: "Manicure", duracion: 45, precio: 300, alias: ["uñas", "mani"] },
    ],
    faq: [
      { pregunta: "¿Dónde están?", respuesta: "[ Dirección del salón ]" },
      { pregunta: "¿Qué formas de pago aceptan?", respuesta: "[ Efectivo, tarjeta, transferencia ]" },
      { pregunta: "¿Atienden sin cita?", respuesta: "[ Sí o no, y cuánto se espera ]" },
    ],
    horario: [{ dias: [2, 3, 4, 5, 6], abre: "10:00", cierra: "20:00" }],
  },
  restaurante: {
    recursos: [
      { nombre: "Mesa 1", capacidad: 4 },
      { nombre: "Mesa 2", capacidad: 4 },
      { nombre: "Mesa 3", capacidad: 6 },
    ],
    servicios: [{ nombre: "Reservación", duracion: 90, precio: null, alias: ["mesa", "reserva"] }],
    faq: [
      { pregunta: "¿Dónde están?", respuesta: "[ Dirección del restaurante ]" },
      { pregunta: "¿Tienen estacionamiento?", respuesta: "[ Sí o no, y si hay valet ]" },
      { pregunta: "¿Aceptan grupos grandes?", respuesta: "[ Hasta cuántas personas y con cuánta anticipación ]" },
      { pregunta: "¿Se puede llevar mascota?", respuesta: "[ Sí, en terraza, o no ]" },
    ],
    horario: [{ dias: [2, 3, 4, 5, 6, 0], abre: "13:00", cierra: "22:00" }],
  },
  taller: {
    recursos: [
      { nombre: "Bahía 1", capacidad: 1 },
      { nombre: "Bahía 2", capacidad: 1 },
    ],
    servicios: [
      { nombre: "Servicio menor", duracion: 90, precio: 1500, alias: ["afinación", "servicio"] },
      { nombre: "Diagnóstico", duracion: 60, precio: 500, alias: ["revisión", "escaneo"] },
    ],
    faq: [
      { pregunta: "¿Dónde están?", respuesta: "[ Dirección del taller ]" },
      { pregunta: "¿Cuánto tarda un servicio?", respuesta: "[ Tiempo típico ]" },
      { pregunta: "¿Dan garantía?", respuesta: "[ Cuánto tiempo y en qué ]" },
    ],
    horario: [{ dias: [1, 2, 3, 4, 5], abre: "08:00", cierra: "18:00" }],
  },
};

export function plantillaDelGiro(vertical: string): Plantilla {
  return PLANTILLAS[vertical] ?? GENERICA;
}

/**
 * Siembra el negocio recién creado. Se ejecuta dentro de la misma transacción
 * del alta: si algo falla, el negocio no queda a medias.
 */
export async function sembrarPlantilla(q: Consulta, tenantId: string, vertical: string): Promise<void> {
  const plantilla = plantillaDelGiro(vertical);

  for (const r of plantilla.recursos) {
    await q("insert into resource (tenant_id, nombre, capacidad, activo) values ($1, $2, $3, true)", [
      tenantId,
      r.nombre,
      r.capacidad,
    ]);
  }

  for (const s of plantilla.servicios) {
    await q(
      `insert into service (tenant_id, nombre, duracion_min, precio, alias, activo, sugerido)
       values ($1, $2, $3, $4, $5, true, true)`,
      [tenantId, s.nombre, s.duracion, s.precio, s.alias],
    );
  }

  for (const f of plantilla.faq) {
    await q(
      "insert into knowledge (tenant_id, pregunta, respuesta, prioridad, sugerido) values ($1, $2, $3, 0, true)",
      [tenantId, f.pregunta, f.respuesta],
    );
  }

  for (const franja of plantilla.horario) {
    for (const dia of franja.dias) {
      await q(
        `insert into schedule_rule (tenant_id, tipo, dia_semana, hora_inicio, hora_fin)
         values ($1, 'disponible', $2, $3::time, $4::time)`,
        [tenantId, dia, franja.abre, franja.cierra],
      );
    }
  }
}
