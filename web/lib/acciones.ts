"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conSesion, elevado } from "@/lib/db";
import { usuarioActual, iniciarSesionLocal, registrarLocal, cerrarSesion, modoSupabase } from "@/lib/auth";
import { contexto, datos, elegirNegocio } from "@/lib/sesion";
import type { ProveedorTts, Regla, ResultadoCatalogo, TtsAjustes, Vertical } from "@/lib/tipos";

export type Estado = { error?: string; ok?: string };

const texto = (fd: FormData, campo: string): string => String(fd.get(campo) ?? "").trim();
const numero = (fd: FormData, campo: string, porDefecto = 0): number => {
  const valor = Number(fd.get(campo));
  return Number.isFinite(valor) ? valor : porDefecto;
};
const opcional = (fd: FormData, campo: string): string | null => texto(fd, campo) || null;

function refrescarPanel(): void {
  for (const ruta of [
    "/resumen",
    "/agenda",
    "/horarios",
    "/servicios",
    "/catalogo",
    "/conocimiento",
    "/agente",
    "/probar",
  ]) {
    revalidatePath(ruta);
  }
}

export async function entrar(_previo: Estado, fd: FormData): Promise<Estado> {
  const email = texto(fd, "email");
  const password = texto(fd, "password");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  if (modoSupabase()) return { error: "En modo Supabase el acceso se hace desde el formulario del cliente." };
  const id = await iniciarSesionLocal(email, password);
  if (!id) return { error: "Correo o contraseña incorrectos." };
  redirect("/resumen");
}

export async function registrar(_previo: Estado, fd: FormData): Promise<Estado> {
  const email = texto(fd, "email");
  const password = texto(fd, "password");
  if (!email.includes("@")) return { error: "Escribe un correo válido." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  try {
    await registrarLocal(email, password);
  } catch {
    return { error: "Ese correo ya está registrado." };
  }
  redirect("/alta");
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/entrar");
}

export async function cambiarNegocio(fd: FormData): Promise<void> {
  await elegirNegocio(texto(fd, "negocio_id"));
  redirect("/resumen");
}

export async function altaNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Ponle nombre al negocio." };
  const vertical = (texto(fd, "vertical") || "generico") as Vertical;

  const negocioId = await elevado(async (q) => {
    const filas = await q<{ id: string }>(
      `insert into tenant (nombre, vertical, zona_horaria, telefono_escalamiento,
                           slot_granularidad_min, anticipacion_min)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        nombre,
        vertical,
        texto(fd, "zona_horaria") || "America/Mexico_City",
        opcional(fd, "telefono_escalamiento"),
        vertical === "restaurante" ? 15 : 30,
        vertical === "restaurante" ? 60 : 120,
      ],
    );
    const id = filas[0]!.id;
    await q("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", [id, usuario.id]);
    return id;
  });

  await elegirNegocio(negocioId);
  redirect("/alta/recursos");
}

function ajustesTts(fd: FormData): TtsAjustes {
  const ajustes: TtsAjustes = {};
  for (const clave of ["estabilidad", "similitud", "estilo", "velocidad"] as const) {
    const crudo = fd.get(`tts_${clave}`);
    if (crudo === null || String(crudo).trim() === "") continue;
    const valor = Number(crudo);
    if (Number.isFinite(valor)) ajustes[clave] = valor;
  }
  return ajustes;
}

export async function guardarNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const proveedor = (texto(fd, "tts_proveedor") || "elevenlabs") as ProveedorTts;
  await datos(async (q, id) => {
    await q(
      `update tenant set nombre = $2, zona_horaria = $3, telefono_entrada = $4,
              telefono_escalamiento = $5, voz_id = $6, slot_granularidad_min = $7,
              anticipacion_min = $8, horizonte_dias = $9, tts_proveedor = $10,
              tts_ajustes = $11::jsonb, instrucciones_extra = $12
         where id = $1`,
      [
        id,
        texto(fd, "nombre"),
        texto(fd, "zona_horaria"),
        opcional(fd, "telefono_entrada"),
        opcional(fd, "telefono_escalamiento"),
        opcional(fd, "voz_id"),
        numero(fd, "slot_granularidad_min", 15),
        numero(fd, "anticipacion_min", 60),
        numero(fd, "horizonte_dias", 60),
        proveedor,
        JSON.stringify(ajustesTts(fd)),
        opcional(fd, "instrucciones_extra"),
      ],
    );
  });
  refrescarPanel();
  return { ok: "Configuración guardada." };
}

export async function guardarItemCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  const tipo = texto(fd, "tipo").toLowerCase();
  if (!nombre) return { error: "El item necesita un nombre." };
  if (!tipo) return { error: "Elige o escribe un tipo." };

  const alias = JSON.stringify(
    texto(fd, "alias")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  );
  const atributos = texto(fd, "atributos") || "{}";
  try {
    JSON.parse(atributos);
  } catch {
    return { error: "Los atributos quedaron mal formados." };
  }

  const id = opcional(fd, "id");
  const precio = texto(fd, "precio") ? numero(fd, "precio") : null;
  const recurso = opcional(fd, "resource_id");

  try {
    await datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update catalogo_item
              set tipo = $2, nombre = $3, descripcion = $4, precio = $5,
                  alias = $6::jsonb, atributos = $7::jsonb, resource_id = $8, orden = $9
            where id = $1`,
          [id, tipo, nombre, opcional(fd, "descripcion"), precio, alias, atributos, recurso, numero(fd, "orden")],
        );
      } else {
        await q(
          `insert into catalogo_item
             (tenant_id, tipo, nombre, descripcion, precio, alias, atributos, resource_id, orden)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
          [negocioId, tipo, nombre, opcional(fd, "descripcion"), precio, alias, atributos, recurso, numero(fd, "orden")],
        );
      }
    });
  } catch {
    return { error: `Ya existe un ${tipo} con ese nombre.` };
  }
  refrescarPanel();
  return { ok: "Item guardado." };
}

export async function alternarDisponible(fd: FormData): Promise<void> {
  await datos((q) =>
    q("update catalogo_item set disponible = not disponible where id = $1", [texto(fd, "id")]),
  );
  refrescarPanel();
}

export async function eliminarItemCatalogo(fd: FormData): Promise<void> {
  await datos((q) => q("delete from catalogo_item where id = $1", [texto(fd, "id")]));
  refrescarPanel();
}

export async function probarCatalogo(consulta: string, tipo: string | null): Promise<ResultadoCatalogo[]> {
  const { usuario, negocioId } = await contexto();
  return conSesion(usuario.id, (q) =>
    q<ResultadoCatalogo>("select * from public.buscar_catalogo($1, $2, $3, 8)", [
      negocioId,
      consulta,
      tipo,
    ]),
  );
}

export async function probarConocimiento(
  consulta: string,
): Promise<{ pregunta: string; respuesta: string; puntaje: number }[]> {
  const { usuario, negocioId } = await contexto();
  return conSesion(usuario.id, (q) =>
    q<{ pregunta: string; respuesta: string; puntaje: number }>(
      "select * from public.buscar_conocimiento($1, $2, 4)",
      [negocioId, consulta],
    ),
  );
}

export async function guardarRecurso(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "El recurso necesita un nombre." };
  const id = opcional(fd, "id");
  const capacidad = Math.max(1, numero(fd, "capacidad", 1));
  const etiqueta = opcional(fd, "etiqueta");
  const metadatos = etiqueta ? JSON.stringify({ etiqueta }) : "{}";
  try {
    await datos(async (q, negocioId) => {
      if (id) {
        await q("update resource set nombre = $2, capacidad = $3, metadatos = $4::jsonb where id = $1", [
          id,
          nombre,
          capacidad,
          metadatos,
        ]);
      } else {
        await q(
          "insert into resource (tenant_id, nombre, capacidad, metadatos) values ($1, $2, $3, $4::jsonb)",
          [negocioId, nombre, capacidad, metadatos],
        );
      }
    });
  } catch {
    return { error: "Ya existe un recurso con ese nombre." };
  }
  refrescarPanel();
  return { ok: "Recurso guardado." };
}

export async function alternarRecurso(fd: FormData): Promise<void> {
  await datos((q) => q("update resource set activo = not activo where id = $1", [texto(fd, "id")]));
  refrescarPanel();
}

export async function guardarServicio(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "El servicio necesita un nombre." };
  const duracion = numero(fd, "duracion_min", 0);
  if (duracion <= 0) return { error: "La duración debe ser mayor a cero." };
  const alias = JSON.stringify(
    texto(fd, "alias")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  );
  const recursos = JSON.stringify(fd.getAll("recursos_validos").map(String));
  const precio = texto(fd, "precio") ? numero(fd, "precio") : null;
  const id = opcional(fd, "id");
  try {
    await datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update service set nombre = $2, alias = $3::jsonb, duracion_min = $4, buffer_min = $5,
                  precio = $6, recursos_validos = $7::jsonb where id = $1`,
          [id, nombre, alias, duracion, numero(fd, "buffer_min"), precio, recursos],
        );
      } else {
        await q(
          `insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio, recursos_validos)
           values ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)`,
          [negocioId, nombre, alias, duracion, numero(fd, "buffer_min"), precio, recursos],
        );
      }
    });
  } catch {
    return { error: "Ya existe un servicio con ese nombre." };
  }
  refrescarPanel();
  return { ok: "Servicio guardado." };
}

export async function alternarServicio(fd: FormData): Promise<void> {
  await datos((q) => q("update service set activo = not activo where id = $1", [texto(fd, "id")]));
  refrescarPanel();
}

export type ReglaNueva = Omit<Regla, "id">;

export async function guardarHorario(reglas: ReglaNueva[]): Promise<Estado> {
  await datos(async (q, id) => {
    await q("delete from schedule_rule where tenant_id = $1 and fecha is null", [id]);
    for (const r of reglas) {
      await q(
        `insert into schedule_rule (tenant_id, resource_id, tipo, dia_semana, hora_inicio, hora_fin)
         values ($1, $2, $3, $4, $5::time, $6::time)`,
        [id, r.resource_id, r.tipo, r.dia_semana, r.hora_inicio, r.hora_fin],
      );
    }
  });
  refrescarPanel();
  return { ok: "Horario guardado." };
}

export async function guardarExcepcion(_previo: Estado, fd: FormData): Promise<Estado> {
  const fecha = texto(fd, "fecha");
  if (!fecha) return { error: "Elige una fecha." };
  const tipo = texto(fd, "tipo") || "festivo";
  await datos((q, id) =>
    q(
      `insert into schedule_rule (tenant_id, tipo, fecha, hora_inicio, hora_fin)
       values ($1, $2, $3::date, $4::time, $5::time)`,
      [id, tipo, fecha, texto(fd, "hora_inicio") || "00:00", texto(fd, "hora_fin") || "23:59"],
    ),
  );
  refrescarPanel();
  return { ok: "Excepción agregada." };
}

export async function eliminarRegla(fd: FormData): Promise<void> {
  await datos((q) => q("delete from schedule_rule where id = $1", [texto(fd, "id")]));
  refrescarPanel();
}

export async function guardarFaq(_previo: Estado, fd: FormData): Promise<Estado> {
  const pregunta = texto(fd, "pregunta");
  const respuesta = texto(fd, "respuesta");
  if (!pregunta || !respuesta) return { error: "Faltan la pregunta o la respuesta." };
  const id = opcional(fd, "id");
  await datos(async (q, negocioId) => {
    if (id) {
      await q("update knowledge set pregunta = $2, respuesta = $3, prioridad = $4 where id = $1", [
        id,
        pregunta,
        respuesta,
        numero(fd, "prioridad"),
      ]);
    } else {
      await q(
        "insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values ($1, $2, $3, $4)",
        [negocioId, pregunta, respuesta, numero(fd, "prioridad")],
      );
    }
  });
  refrescarPanel();
  return { ok: "Respuesta guardada." };
}

export async function eliminarFaq(fd: FormData): Promise<void> {
  await datos((q) => q("delete from knowledge where id = $1", [texto(fd, "id")]));
  refrescarPanel();
}

export async function cancelarReserva(fd: FormData): Promise<void> {
  const { usuario, negocioId } = await contexto();
  await conSesion(usuario.id, (q) =>
    q("select public.cancelar_reserva($1, $2)", [negocioId, texto(fd, "id")]),
  );
  refrescarPanel();
}

export type Slot = { inicio: string; fin: string; resource_id: string; resource_nombre: string };

export async function slotsLibres(servicioId: string, dia: string, personas: number): Promise<Slot[]> {
  const { usuario, negocioId } = await contexto();
  return conSesion(usuario.id, (q) =>
    q<Slot>("select * from public.slots_libres($1, $2, $3::date, $4, 40)", [
      negocioId,
      servicioId,
      dia,
      personas,
    ]),
  );
}

export async function reagendarReserva(reservaId: string, inicio: string): Promise<Estado> {
  try {
    const movidas = await datos(async (q, id) => {
      const filas = await q<{ id: string }>(
        `update booking b
            set inicio = $3::timestamptz,
                fin = $3::timestamptz + make_interval(mins => s.duracion_min + s.buffer_min)
           from service s
          where b.id = $2 and b.tenant_id = $1 and s.id = b.service_id and b.estado = 'confirmada'
          returning b.id`,
        [id, reservaId, inicio],
      );
      return filas.length;
    });
    if (movidas === 0) return { error: "La reserva ya no está confirmada." };
  } catch {
    return { error: "Ese horario acaba de ocuparse. Elige otro." };
  }
  refrescarPanel();
  return { ok: "Reserva movida." };
}

export async function crearReserva(_previo: Estado, fd: FormData): Promise<Estado> {
  const { usuario, negocioId } = await contexto();
  const resultado = await conSesion(usuario.id, async (q) => {
    const filas = await q<{ reservar: { ok: boolean; error?: string; codigo?: string } }>(
      "select public.reservar($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, null) as reservar",
      [
        negocioId,
        texto(fd, "service_id"),
        texto(fd, "resource_id"),
        texto(fd, "inicio"),
        texto(fd, "cliente_nombre"),
        texto(fd, "telefono"),
        Math.max(1, numero(fd, "personas", 1)),
        opcional(fd, "notas"),
      ],
    );
    return filas[0]!.reservar;
  });
  refrescarPanel();
  if (!resultado.ok) {
    const mensajes: Record<string, string> = {
      slot_tomado: "Ese horario acaba de ocuparse.",
      recurso_invalido: "El recurso no tiene capacidad para esas personas.",
      servicio_invalido: "El servicio no existe o está inactivo.",
    };
    return { error: mensajes[resultado.error ?? ""] ?? "No se pudo reservar." };
  }
  return { ok: `Reservado con código ${resultado.codigo}.` };
}

export type ItemPedido = {
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
  notas: string | null;
};

export type ResumenPedido = {
  id: string;
  codigo: string;
  estado: string;
  tipo: string;
  total: string;
  items: ItemPedido[];
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
  pedido: ResumenPedido | null;
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

export async function estadoPrueba(minutos: number): Promise<EstadoPrueba> {
  return datos(async (q, id) => {
    const pedidos = await q<{ id: string; resumen: Omit<ResumenPedido, "id"> | null }>(
      `select p.id, public.pedido_resumen($1, p.id) as resumen
         from pedido p
        where p.tenant_id = $1 and p.creado >= now() - make_interval(mins => $2::int)
        order by p.creado desc limit 1`,
      [id, minutos],
    );

    const reservas = await q<EstadoPrueba["reservas"][number]>(
      `select b.id, b.codigo, b.cliente_nombre, b.inicio, s.nombre as servicio,
              r.nombre as recurso, b.personas
         from booking b
         join service s on s.id = b.service_id
         join resource r on r.id = b.resource_id
        where b.tenant_id = $1 and b.creado >= now() - make_interval(mins => $2::int)
        order by b.creado desc limit 5`,
      [id, minutos],
    );

    const llamadas = await q<LlamadaPrueba>(
      `select call_id, inicio, duracion_seg, resuelto, escalado, motivo_escalamiento
         from call_log
        where tenant_id = $1 and inicio >= now() - make_interval(mins => $2::int)
        order by inicio desc limit 5`,
      [id, minutos],
    );

    const primero = pedidos[0];
    return {
      pedido: primero?.resumen ? { id: primero.id, ...primero.resumen } : null,
      reservas,
      llamadas,
    };
  });
}
