"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conSesion, elevado } from "@/lib/db";
import { usuarioActual, iniciarSesionLocal, registrarLocal, cerrarSesion, modoSupabase } from "@/lib/auth";
import { avance } from "@/lib/listo";
import { negocio } from "@/lib/consultas";
import { sembrarPlantilla } from "@/lib/plantilla-inicial";
import { contexto, datos, elegirNegocio } from "@/lib/sesion";
import { siguientePaso } from "@/lib/giro";
import {
  AJUSTES_ELEVENLABS,
  FORMATO_VOZ,
  VELOCIDAD_AZURE,
  nombreProveedorTts,
  vozValida,
  type EstadoPedido,
  type Herramienta,
  type ProveedorLlm,
  type ProveedorTts,
  type Regla,
  type ResultadoCatalogo,
  type TtsAjustes,
  type Vertical,
} from "@/lib/tipos";

export type Estado = { error?: string; ok?: string };

const texto = (fd: FormData, campo: string): string => String(fd.get(campo) ?? "").trim();
const numero = (fd: FormData, campo: string, porDefecto = 0): number => {
  const valor = Number(fd.get(campo));
  return Number.isFinite(valor) ? valor : porDefecto;
};
const opcional = (fd: FormData, campo: string): string | null => texto(fd, campo) || null;

/**
 * Refresca el panel entero después de una acción.
 *
 * Tiene que ser "layout", no la lista de páginas: la barra de avance vive en el
 * armazón y con el modo por omisión se quedaba con el conteo viejo hasta que
 * alguien recargaba a mano.
 */
function refrescarPanel(): void {
  revalidatePath("/", "layout");
}

export async function entrar(_previo: Estado, fd: FormData): Promise<Estado> {
  const email = texto(fd, "email");
  const password = texto(fd, "password");
  if (!email || !password) return { error: "Escribe tu correo y contraseña." };
  if (modoSupabase()) return { error: "En modo Supabase el acceso se hace desde el formulario del cliente." };
  const id = await iniciarSesionLocal(email, password);
  if (!id) return { error: "Correo o contraseña incorrectos." };
  redirect("/hoy");
}

export async function registrar(_previo: Estado, fd: FormData): Promise<Estado> {
  const email = texto(fd, "email");
  const password = texto(fd, "password");
  const nombre = texto(fd, "nombre");
  const elegido = texto(fd, "vertical") || "generico";

  if (!email.includes("@")) return { error: "Escribe un correo válido." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (!nombre) return { error: "Ponle nombre a tu negocio." };
  if (elegido === "propio" && !texto(fd, "giro_nombre")) return { error: "Ponle nombre al giro." };
  const vertical: Vertical = elegido === "propio" ? await crearGiroPropio(fd) : elegido;

  let usuarioId: string;
  try {
    usuarioId = await registrarLocal(email, password);
  } catch {
    return { error: "Ese correo ya está registrado." };
  }

  // El negocio se crea aquí mismo: una sola pantalla para empezar, y el panel
  // se abre con la plantilla del giro ya puesta.
  const creado = await crearNegocio(usuarioId, {
    nombre,
    vertical,
    zonaHoraria: "America/Mexico_City",
    telefonoEscalamiento: null,
  });
  await elegirNegocio(creado.id);
  redirect("/hoy");
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/entrar");
}

/**
 * Crea el negocio, hace dueño a quien lo crea y lo siembra con la plantilla de
 * su giro. Lo usan el registro y el alta de un negocio adicional.
 */
async function crearNegocio(
  usuarioId: string,
  datos: { nombre: string; vertical: Vertical; zonaHoraria: string; telefonoEscalamiento: string | null },
): Promise<{ id: string; herramientas: Herramienta[] }> {
  return elevado(async (q) => {
    const plantillas = await q<{ herramientas: Herramienta[] }>(
      "select herramientas from vertical_template where clave = $1",
      [datos.vertical],
    );
    const herramientas = plantillas[0]?.herramientas ?? ["agendar", "recado"];
    const rapido = herramientas.includes("pedido") || datos.vertical === "restaurante";
    const filas = await q<{ id: string }>(
      `insert into tenant (nombre, vertical, zona_horaria, telefono_escalamiento,
                           slot_granularidad_min, anticipacion_min)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        datos.nombre,
        datos.vertical,
        datos.zonaHoraria,
        datos.telefonoEscalamiento,
        rapido ? 15 : 30,
        rapido ? 60 : 120,
      ],
    );
    const id = filas[0]!.id;
    await q("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", [id, usuarioId]);
    // Nace con lo típico de su giro, marcado como sugerido: se edita, no se
    // crea desde cero. Va en la misma transacción que el alta.
    await sembrarPlantilla(q, id, datos.vertical);
    return { id, herramientas };
  });
}

const HERRAMIENTAS_VALIDAS: Herramienta[] = ["agendar", "pedido", "recado"];

/**
 * Un giro que no está en el catálogo se guarda como plantilla propia del
 * negocio: el motor la lee igual que a las de fábrica, el menú de alta no la
 * muestra. La clave lleva un sufijo aleatorio para que dos negocios con el
 * mismo giro no choquen.
 */
async function crearGiroPropio(fd: FormData): Promise<Vertical> {
  const nombre = texto(fd, "giro_nombre");
  const elegidas = fd
    .getAll("giro_herramientas")
    .map(String)
    .filter((h): h is Herramienta => HERRAMIENTAS_VALIDAS.includes(h as Herramienta));
  const herramientas: Herramienta[] = elegidas.length > 0 ? elegidas : ["recado"];
  const descripcion = texto(fd, "giro_instrucciones");
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const clave = `propio_${base || "giro"}_${Math.random().toString(36).slice(2, 8)}`;
  const instrucciones = [
    `CONTEXTO: ${nombre.toLowerCase()}.`,
    descripcion ? `- ${descripcion}` : null,
    herramientas.includes("agendar") ? "- Agenda solo en horarios que devuelva la herramienta de disponibilidad." : null,
    herramientas.includes("pedido") ? "- Consulta el catalogo antes de decir que hay o cuanto cuesta." : null,
    "- Lo que no puedas resolver, toma recado o transfiere.",
  ]
    .filter(Boolean)
    .join("\n");
  await elevado((q) =>
    q(
      `insert into vertical_template (clave, nombre, instrucciones, saludo, herramientas, activo, propio)
       values ($1, $2, $3, $4, $5::jsonb, true, true)`,
      [clave, nombre, instrucciones, "{nombre}, buen dia. ¿En que le puedo ayudar?", JSON.stringify(herramientas)],
    ),
  );
  return clave;
}

export async function altaNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Ponle nombre al negocio." };
  const elegido = texto(fd, "vertical") || "generico";
  if (elegido === "propio" && !texto(fd, "giro_nombre")) return { error: "Ponle nombre al giro." };
  const vertical: Vertical = elegido === "propio" ? await crearGiroPropio(fd) : elegido;

  const creado = await crearNegocio(usuario.id, {
    nombre,
    vertical,
    zonaHoraria: texto(fd, "zona_horaria") || "America/Mexico_City",
    telefonoEscalamiento: opcional(fd, "telefono_escalamiento"),
  });

  await elegirNegocio(creado.id);
  redirect("/hoy");
}

function decimal(fd: FormData, campo: string, min: number, max: number): number | null {
  const crudo = fd.get(campo);
  if (crudo === null || String(crudo).trim() === "") return null;
  const valor = Number(crudo);
  if (!Number.isFinite(valor)) return null;
  return Math.min(max, Math.max(min, valor));
}

function ajustesTts(fd: FormData, proveedor: ProveedorTts): TtsAjustes {
  if (proveedor === "azure") {
    const rate = decimal(fd, "tts_rate", VELOCIDAD_AZURE.min, VELOCIDAD_AZURE.max);
    return rate === null ? {} : { prosodia: { rate } };
  }
  if (proveedor === "elevenlabs") {
    const ajustes: TtsAjustes = {};
    for (const campo of AJUSTES_ELEVENLABS) {
      const valor = decimal(fd, `tts_${campo.clave}`, campo.min, campo.max);
      if (valor !== null) ajustes[campo.clave] = valor;
    }
    return ajustes;
  }
  return {};
}

function errorLegible(error: unknown, proveedor?: ProveedorTts): string {
  const mensaje = error instanceof Error ? error.message : "";
  if (proveedor && /voz_id/.test(mensaje)) {
    const formato = FORMATO_VOZ[proveedor];
    const nombre = nombreProveedorTts(proveedor);
    return `La base rechazó la voz: no tiene el formato de ${nombre} (${formato.formato}). Ejemplo: ${formato.ejemplo}.`;
  }
  // El número de entrada es único: dos negocios no pueden compartirlo.
  if (/telefono_entrada/.test(mensaje) && /duplicate|unique/i.test(mensaje)) {
    return "Ese número de entrada ya está asignado a otro negocio.";
  }
  if (/statement timeout|timeout/i.test(mensaje)) {
    return "La base tardó demasiado en responder. Intenta de nuevo.";
  }
  return "No se pudo guardar.";
}

export async function guardarNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const proveedor = (texto(fd, "tts_proveedor") || "azure") as ProveedorTts;
  const proveedorLlm = (texto(fd, "llm_proveedor") || "openai") as ProveedorLlm;
  const voz = opcional(fd, "voz_id");

  if (voz && !vozValida(proveedor, voz)) {
    const formato = FORMATO_VOZ[proveedor];
    return {
      error: `"${voz}" no es una voz de ${nombreProveedorTts(proveedor)}. Se espera ${formato.formato}, por ejemplo ${formato.ejemplo}.`,
    };
  }

  // Candado: el número de entrada solo se guarda cuando el negocio está
  // completo. Un agente a medias contestando el teléfono real queda mal con
  // el cliente, y el dueño no siempre lee el aviso.
  const telefonoEntrada = opcional(fd, "telefono_entrada");
  if (telefonoEntrada) {
    const { giro } = await contexto();
    const progreso = await avance(giro.herramientas);
    const previo = await negocio();
    if (!progreso.completo && telefonoEntrada !== previo.telefono_entrada) {
      const faltan = progreso.requisitos.filter((r) => !r.listo).map((r) => r.nombre.toLowerCase());
      return { error: `El número de entrada se activa cuando todo está listo. Falta: ${faltan.join(", ")}.` };
    }
  }

  try {
    await datos(async (q, id) => {
      await q(
        `update tenant set nombre = $2, zona_horaria = $3, telefono_entrada = $4,
                telefono_escalamiento = $5, voz_id = $6, slot_granularidad_min = $7,
                anticipacion_min = $8, horizonte_dias = $9, tts_proveedor = $10,
                tts_ajustes = $11::jsonb, instrucciones_extra = $12,
                llm_proveedor = $13, llm_modelo = $14,
                instagram_id = $15, messenger_page_id = $16
           where id = $1`,
        [
          id,
          texto(fd, "nombre"),
          texto(fd, "zona_horaria"),
          telefonoEntrada,
          opcional(fd, "telefono_escalamiento"),
          voz,
          numero(fd, "slot_granularidad_min", 15),
          numero(fd, "anticipacion_min", 60),
          numero(fd, "horizonte_dias", 60),
          proveedor,
          JSON.stringify(ajustesTts(fd, proveedor)),
          opcional(fd, "instrucciones_extra"),
          proveedorLlm,
          opcional(fd, "llm_modelo"),
          opcional(fd, "instagram_id"),
          opcional(fd, "messenger_page_id"),
        ],
      );
    });
  } catch (error) {
    return { error: errorLegible(error, proveedor) };
  }
  refrescarPanel();
  return { ok: "Configuración guardada." };
}

/** Abrirla es haberla leído: baja el contador del menú. */
export async function marcarLeida(conversacionId: string): Promise<void> {
  await datos(async (q, id) => {
    await q("select conversacion_marcar_leida($1, $2)", [id, conversacionId]);
  });
  revalidatePath("/", "layout");
}

/** La primera frase de cada llamada. Vacío usa la de la plantilla del vertical. */
export async function guardarSaludo(_previo: Estado, fd: FormData): Promise<Estado> {
  const propio = opcional(fd, "saludo");
  try {
    await datos(async (q, id) => {
      await q("update tenant set saludo = $2 where id = $1", [id, propio]);
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: propio ? "Saludo guardado." : "Saludo de fábrica restaurado." };
}

/** Crea un grupo del catálogo. El nombre se guarda en minúscula, sin espacios. */
export async function agregarGrupoCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const crudo = texto(fd, "grupo").trim().toLowerCase();
  const grupo = crudo.replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  if (!grupo) return { error: "El grupo necesita un nombre." };
  try {
    await datos(async (q, id) => {
      await q(
        `update tenant
            set tipos_catalogo = (select array_agg(distinct t)
                                    from unnest(tipos_catalogo || array[$2]) as t)
          where id = $1`,
        [id, grupo],
      );
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: `Grupo "${grupo}" agregado.` };
}

/** Quita un grupo. Solo si ya no tiene items: si los tiene, se avisa. */
export async function quitarGrupoCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const grupo = texto(fd, "grupo");
  try {
    let conItems = 0;
    await datos(async (q, id) => {
      const filas = await q<{ total: string }>(
        "select count(*)::text as total from catalogo_item where tenant_id = $1 and tipo = $2",
        [id, grupo],
      );
      conItems = Number(filas[0]?.total ?? 0);
      if (conItems > 0) return;
      await q("update tenant set tipos_catalogo = array_remove(tipos_catalogo, $2) where id = $1", [
        id,
        grupo,
      ]);
    });
    if (conItems > 0) {
      return { error: `"${grupo}" todavía tiene ${conItems} items. Muévelos o bórralos primero.` };
    }
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: "Grupo quitado." };
}

/**
 * Reescribe las instrucciones base del agente. Vacío vuelve a las de fábrica.
 * Los bloques que salen de los datos —servicios, horarios, catálogo, fecha—
 * se siguen generando aparte: aquí solo vive el texto de instrucciones.
 */
export async function guardarPrompt(_previo: Estado, fd: FormData): Promise<Estado> {
  const propio = opcional(fd, "prompt_base");
  try {
    await datos(async (q, id) => {
      await q("update tenant set prompt_base = $2 where id = $1", [id, propio]);
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: propio ? "Instrucciones guardadas." : "Instrucciones de fábrica restauradas." };
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
  const existencias = texto(fd, "existencias") ? Math.max(0, Math.round(numero(fd, "existencias", 0))) : null;

  try {
    await datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update catalogo_item
              set tipo = $2, nombre = $3, descripcion = $4, precio = $5,
                  alias = $6::jsonb, atributos = $7::jsonb, resource_id = $8, orden = $9, existencias = $10
            where id = $1`,
          [id, tipo, nombre, opcional(fd, "descripcion"), precio, alias, atributos, recurso, numero(fd, "orden"), existencias],
        );
      } else {
        await q(
          `insert into catalogo_item
           (tenant_id, tipo, nombre, descripcion, precio, alias, atributos, resource_id, orden, existencias)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)`,
          [negocioId, tipo, nombre, opcional(fd, "descripcion"), precio, alias, atributos, recurso, numero(fd, "orden"), existencias],
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
  await datos((q, negocioId) =>
    q("delete from catalogo_item where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId]),
  );
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
  const tipo = texto(fd, "tipo") === "persona" ? "persona" : "lugar";
  const comision = texto(fd, "comision_pct") ? Math.min(100, Math.max(0, numero(fd, "comision_pct", 0))) : null;
  try {
    await datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update resource set nombre = $2, capacidad = $3, metadatos = $4::jsonb, tipo = $5, telefono = $6, correo = $7, comision_pct = $8
            where id = $1`,
          [id, nombre, capacidad, metadatos, tipo, opcional(fd, "telefono"), opcional(fd, "correo"), comision],
        );
      } else {
        await q(
          `insert into resource (tenant_id, nombre, capacidad, metadatos, tipo, telefono, correo, comision_pct)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
          [negocioId, nombre, capacidad, metadatos, tipo, opcional(fd, "telefono"), opcional(fd, "correo"), comision],
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

/** Una ausencia: la persona no atiende esos días. Es un bloqueo por fecha con motivo. */
export async function guardarAusencia(_previo: Estado, fd: FormData): Promise<Estado> {
  const recurso = texto(fd, "resource_id");
  const desde = texto(fd, "desde");
  const hasta = texto(fd, "hasta") || desde;
  if (!recurso) return { error: "Elige a quién." };
  if (!desde) return { error: "Elige desde cuándo." };
  if (hasta < desde) return { error: "El fin no puede ser antes del inicio." };
  const dias = Math.round((new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 86400000) + 1;
  if (dias > 62) return { error: "Máximo dos meses seguidos." };
  await datos((q, id) =>
    q(
      `insert into schedule_rule (tenant_id, resource_id, tipo, fecha, hora_inicio, hora_fin, motivo)
       select $1, $2, 'bloqueo', d::date, '00:00'::time, '23:59'::time, $5
         from generate_series($3::date, $4::date, interval '1 day') d`,
      [id, recurso, desde, hasta, opcional(fd, "motivo")],
    ),
  );
  refrescarPanel();
  return { ok: dias === 1 ? "Ausencia guardada." : `${dias} días bloqueados.` };
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
  await datos((q, negocioId) =>
    q("delete from schedule_rule where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId]),
  );
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
  await datos((q, negocioId) =>
    q("delete from knowledge where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId]),
  );
  refrescarPanel();
}

export async function cancelarReserva(fd: FormData): Promise<void> {
  const { usuario, negocioId } = await contexto();
  await conSesion(usuario.id, (q) =>
    q("select public.cancelar_reserva($1, $2)", [negocioId, texto(fd, "id")]),
  );
  refrescarPanel();
}

export async function guardarCliente(_previo: Estado, fd: FormData): Promise<Estado> {
  const id = texto(fd, "id");
  const etiquetas = texto(fd, "etiquetas")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  try {
    await datos((q, negocioId) =>
      q(
        `update cliente
            set nombre = $3, correo = $4, notas = $5, etiquetas = $6::text[], actualizado = now()
          where id = $2 and tenant_id = $1`,
        [negocioId, id, opcional(fd, "nombre"), opcional(fd, "correo"), opcional(fd, "notas"), etiquetas],
      ),
    );
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: "Cliente guardado." };
}

const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia", "enlace", "otro"];

/** Registra lo que de verdad se cobró por una cita o un pedido. */
export async function registrarPago(_previo: Estado, fd: FormData): Promise<Estado> {
  const monto = numero(fd, "monto", -1);
  if (monto < 0) return { error: "Escribe el monto." };
  const metodo = texto(fd, "metodo");
  if (!METODOS_PAGO.includes(metodo)) return { error: "Elige cómo se pagó." };
  const pendiente = fd.get("pendiente") === "1";
  try {
    await datos((q, negocioId) =>
      q(
        `insert into pago (tenant_id, booking_id, pedido_id, concepto, monto, metodo, estado, enlace_url, referencia_externa, notas)
         values ($1, $2, $3, $4, $5, $6::pago_metodo, $7::pago_estado, $8, $9, $10)`,
        [
          negocioId,
          opcional(fd, "booking_id"),
          opcional(fd, "pedido_id"),
          texto(fd, "concepto") || "Cobro",
          monto,
          metodo,
          pendiente ? "pendiente" : "pagado",
          opcional(fd, "enlace_url"),
          opcional(fd, "referencia"),
          opcional(fd, "notas"),
        ],
      ),
    );
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  return { ok: pendiente ? "Cobro pendiente registrado." : "Cobro registrado." };
}

export async function cambiarEstadoPago(fd: FormData): Promise<void> {
  const estado = texto(fd, "estado");
  if (!["pagado", "cancelado", "reembolsado"].includes(estado)) return;
  await datos((q, negocioId) =>
    q(
      `update pago set estado = $3::pago_estado, pagado_en = case when $3 = 'pagado' then now() else pagado_en end, actualizado = now()
        where id = $2 and tenant_id = $1`,
      [negocioId, texto(fd, "id"), estado],
    ),
  );
  refrescarPanel();
}

const TIPOS_CAMPANA = ["no_show", "inactivos", "recordatorio_pago", "resena", "marketing", "manual"];

export async function crearCampana(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  const tipo = texto(fd, "tipo");
  const canal = texto(fd, "canal") === "llamada" ? "llamada" : "whatsapp";
  const mensaje = texto(fd, "mensaje");
  if (!nombre) return { error: "Ponle nombre a la campaña." };
  if (!TIPOS_CAMPANA.includes(tipo)) return { error: "Elige a quién va dirigida." };
  if (!mensaje) return { error: canal === "llamada" ? "Escribe el guion de la llamada." : "Escribe el mensaje." };
  const dias = Math.max(1, Math.min(365, numero(fd, "dias", 30)));
  let id = "";
  try {
    id = await datos(async (q, negocioId) => {
      const filas = await q<{ id: string }>(
        `insert into campana (tenant_id, nombre, tipo, canal, criterio, mensaje, objetivo, ventana_inicio, ventana_fin, max_intentos)
         values ($1, $2, $3::campana_tipo, $4::campana_canal, $5::jsonb, $6, $7, $8::time, $9::time, $10)
         returning id`,
        [
          negocioId,
          nombre,
          tipo,
          canal,
          JSON.stringify({ dias }),
          mensaje,
          opcional(fd, "objetivo"),
          texto(fd, "ventana_inicio") || "10:00",
          texto(fd, "ventana_fin") || "19:00",
          Math.max(1, Math.min(5, numero(fd, "max_intentos", 2))),
        ],
      );
      const nuevo = filas[0]!.id;
      await q("select public.campana_poblar($1)", [nuevo]);
      return nuevo;
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
  refrescarPanel();
  redirect(`/campanas/${id}`);
}

export async function cambiarEstadoCampana(fd: FormData): Promise<void> {
  const estado = texto(fd, "estado");
  if (!["activa", "pausada", "terminada"].includes(estado)) return;
  await datos(async (q, negocioId) => {
    await q("update campana set estado = $3::campana_estado, actualizado = now() where id = $2 and tenant_id = $1", [
      negocioId,
      texto(fd, "id"),
      estado,
    ]);
    if (estado === "activa") await q("select public.campana_poblar($1)", [texto(fd, "id")]);
  });
  refrescarPanel();
}

export async function agregarContactosCampana(fd: FormData): Promise<void> {
  const campanaId = texto(fd, "campana_id");
  const segmento = texto(fd, "segmento");
  const condiciones: Record<string, string> = {
    todos: "true",
    frecuentes: "(select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada') >= 3",
    inactivos: "c.ultimo_contacto < now() - interval '90 days'",
    faltan: "exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'no_asistio')",
  };
  const condicion = condiciones[segmento];
  if (!condicion) return;
  await datos((q, negocioId) =>
    q(
      `insert into campana_contacto (campana_id, tenant_id, cliente_id)
       select $2, $1, c.id from cliente c
        where c.tenant_id = $1 and c.telefono is not null and ${condicion}
       on conflict do nothing`,
      [negocioId, campanaId],
    ),
  );
  refrescarPanel();
}

export async function excluirContacto(fd: FormData): Promise<void> {
  await datos((q, negocioId) =>
    q("select public.campana_contacto_resultado(cc.id, 'excluido') from campana_contacto cc where cc.id = $2 and cc.tenant_id = $1", [
      negocioId,
      texto(fd, "id"),
    ]),
  );
  refrescarPanel();
}

/** Un número de entrada extra ligado a una campaña: quien marque ahí queda atribuido. */
export async function guardarLinea(_previo: Estado, fd: FormData): Promise<Estado> {
  const tel = texto(fd, "telefono").replace(/[^\d+]/g, "");
  const etiqueta = texto(fd, "etiqueta");
  if (!/^\+\d{10,15}$/.test(tel)) return { error: "El número va en formato +52 y diez dígitos." };
  if (!etiqueta) return { error: "Ponle etiqueta: de dónde viene quien marca ahí." };
  try {
    await datos((q, negocioId) =>
      q("insert into linea (tenant_id, telefono, etiqueta, campana_id) values ($1, $2, $3, $4)", [
        negocioId,
        tel,
        etiqueta,
        opcional(fd, "campana_id"),
      ]),
    );
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    return { error: /unique|duplicate/i.test(mensaje) ? "Ese número ya está registrado." : errorLegible(error) };
  }
  refrescarPanel();
  return { ok: "Línea agregada." };
}

export async function eliminarLinea(fd: FormData): Promise<void> {
  await datos((q, negocioId) => q("delete from linea where id = $2 and tenant_id = $1", [negocioId, texto(fd, "id")]));
  refrescarPanel();
}

export async function guardarResenas(_previo: Estado, fd: FormData): Promise<Estado> {
  const espera = Math.max(15, Math.min(1440, numero(fd, "resena_espera_min", 120)));
  const url = opcional(fd, "resena_url");
  if (url && !/^https?:\/\//.test(url)) return { error: "La liga debe empezar con https://" };
  await datos((q, negocioId) =>
    q("update tenant set resena_activa = $2, resena_url = $3, resena_espera_min = $4 where id = $1", [
      negocioId,
      fd.get("resena_activa") === "on",
      url,
      espera,
    ]),
  );
  refrescarPanel();
  return { ok: "Reseñas guardadas." };
}

export type PasoFlujo = "llego" | "atendida" | "no_llego" | "regresar";

/**
 * Mueve una cita dentro del día. `llego` y `regresar` solo tocan `llegada`,
 * así la cita sigue confirmada y sigue bloqueando su horario mientras se atiende.
 */
export async function moverCita(fd: FormData): Promise<void> {
  const paso = texto(fd, "paso") as PasoFlujo;
  const cambios: Record<PasoFlujo, string> = {
    llego: "llegada = now()",
    regresar: "llegada = null",
    atendida: "estado = 'completada', llegada = coalesce(llegada, now())",
    no_llego: "estado = 'no_asistio'",
  };
  const cambio = cambios[paso];
  if (!cambio) return;
  await datos((q, negocioId) =>
    q(`update booking set ${cambio} where id = $2 and tenant_id = $1 and estado = 'confirmada'`, [
      negocioId,
      texto(fd, "id"),
    ]),
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

export async function cambiarEstadoPedido(fd: FormData): Promise<void> {
  const estado = texto(fd, "estado") as EstadoPedido;
  await datos((q, negocioId) =>
    q("update pedido set estado = $3::pedido_estado where id = $2 and tenant_id = $1", [
      negocioId,
      texto(fd, "id"),
      estado,
    ]),
  );
  refrescarPanel();
}

export async function alternarRecado(fd: FormData): Promise<void> {
  await datos((q, negocioId) =>
    q("update lead set atendido = not atendido where id = $2 and tenant_id = $1", [
      negocioId,
      texto(fd, "id"),
    ]),
  );
  refrescarPanel();
}
