"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { elevado, type Consulta } from "@/lib/db";
import { usuarioActual, iniciarSesionLocal, registrarLocal, cerrarSesion, modoSupabase } from "@/lib/auth";
import { avance } from "@/lib/listo";
import { CONDICION_SEGMENTO, alcanceCampana, negocio, type SegmentoCliente } from "@/lib/consultas";
import { TELEFONO_E164, fechaValida, normalizarTelefono } from "@/lib/formato";
import { sembrarPlantilla } from "@/lib/plantilla-inicial";
import { contexto, datos, elegirNegocio, membresias } from "@/lib/sesion";
import {
  AJUSTES_ELEVENLABS,
  ESTADOS_PEDIDO,
  FORMATO_VOZ,
  MODELOS_ELEVENLABS,
  TIPOS_REGLA,
  VELOCIDAD_AZURE,
  nombreProveedorTts,
  vozValida,
  type EstadoPedido,
  type EstadoPrueba,
  type Herramienta,
  type LlamadaPrueba,
  type ProveedorLlm,
  type ProveedorTts,
  type Regla,
  type ResultadoCatalogo,
  type ResumenPedidoPrueba,
  type TipoRegla,
  type TtsAjustes,
  type Vertical,
} from "@/lib/tipos";

export type Estado = { error?: string; ok?: string };

const texto = (fd: FormData, campo: string): string => String(fd.get(campo) ?? "").trim();
/** Un campo vacío es ausencia, no cero: así aplica el valor por defecto. */
const numero = (fd: FormData, campo: string, porDefecto = 0): number => {
  const crudo = texto(fd, campo);
  if (!crudo) return porDefecto;
  const valor = Number(crudo);
  return Number.isFinite(valor) ? valor : porDefecto;
};
const opcional = (fd: FormData, campo: string): string | null => texto(fd, campo) || null;
const ERROR_TELEFONO = "El número va en formato +52 y diez dígitos, por ejemplo +525512345678.";

/** Teléfono opcional normalizado a E.164; `false` cuando viene con formato malo. */
function telefonoOpcional(fd: FormData, campo: string): string | null | false {
  const crudo = texto(fd, campo);
  if (!crudo) return null;
  const tel = normalizarTelefono(crudo);
  return TELEFONO_E164.test(tel) ? tel : false;
}

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

function errorLegible(error: unknown, proveedor?: ProveedorTts): string {
  const mensaje = error instanceof Error ? error.message : "";
  const codigo = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (proveedor && /voz_id/.test(mensaje)) {
    const formato = FORMATO_VOZ[proveedor];
    const nombre = nombreProveedorTts(proveedor);
    return `La base rechazó la voz: no tiene el formato de ${nombre} (${formato.formato}). Ejemplo: ${formato.ejemplo}.`;
  }
  if (/telefono_entrada/.test(mensaje) && /duplicate|unique/i.test(mensaje)) {
    return "Ese número de entrada ya está asignado a otro negocio.";
  }
  if (codigo === "23505" || /duplicate key/i.test(mensaje)) return "Ya existe uno con ese nombre.";
  if (codigo === "23503") return "No se puede: otro registro depende de este.";
  if (codigo === "42501" || /row-level security/i.test(mensaje)) {
    return "No se pudo completar por un permiso en la base. Avísanos y lo revisamos.";
  }
  if (/statement timeout|timeout/i.test(mensaje)) {
    return "La base tardó demasiado en responder. Intenta de nuevo.";
  }
  return "No se pudo guardar.";
}

/**
 * Corre una acción del panel y convierte cualquier fallo en un `{ error }`
 * legible. Devolver filas de una consulta cuenta como éxito sin mensaje.
 */
async function intentar(fn: () => Promise<Estado | unknown[] | void>): Promise<Estado> {
  try {
    const resultado = await fn();
    const estado: Estado = !resultado || Array.isArray(resultado) ? {} : resultado;
    if (estado.error) return estado;
    refrescarPanel();
    return estado;
  } catch (error) {
    return { error: errorLegible(error) };
  }
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

  if (!email.includes("@")) return { error: "Escribe un correo válido." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (!nombre) return { error: "Ponle nombre a tu negocio." };
  const giro = await giroElegido(fd);
  if ("error" in giro) return giro;

  let usuarioId: string;
  try {
    usuarioId = await registrarLocal(email, password);
  } catch {
    return { error: "Ese correo ya está registrado." };
  }

  let creado: { id: string };
  try {
    creado = await crearNegocio(usuarioId, {
      nombre,
      giro,
      zonaHoraria: "America/Mexico_City",
      telefonoEscalamiento: null,
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
  await elegirNegocio(creado.id);
  redirect("/hoy");
}

export async function salir(): Promise<void> {
  await cerrarSesion();
  redirect("/entrar");
}

type GiroElegido = { vertical: Vertical; propio: GiroPropio | null };

/** El giro del formulario: uno del catálogo (verificado) o uno propio por crear. */
async function giroElegido(fd: FormData): Promise<GiroElegido | { error: string }> {
  const elegido = texto(fd, "vertical") || "generico";
  if (elegido === "propio") {
    const propio = giroPropio(fd);
    return "error" in propio ? propio : { vertical: "propio", propio };
  }
  const existe = await elevado((q) =>
    q<{ clave: string }>("select clave from vertical_template where clave = $1 and activo", [elegido]),
  );
  if (existe.length === 0) return { error: "Ese giro no está en el catálogo." };
  return { vertical: elegido, propio: null };
}

/**
 * Crea el negocio, hace dueño a quien lo crea y lo siembra con la plantilla de
 * su giro. Si el giro es propio, la plantilla nace en la misma transacción:
 * un registro que falle no deja plantillas huérfanas.
 */
async function crearNegocio(
  usuarioId: string,
  datos: { nombre: string; giro: GiroElegido; zonaHoraria: string; telefonoEscalamiento: string | null },
): Promise<{ id: string; herramientas: Herramienta[] }> {
  return elevado(async (q) => {
    const vertical = datos.giro.propio ? await crearGiroPropio(q, datos.giro.propio) : datos.giro.vertical;
    const plantillas = await q<{ herramientas: Herramienta[] }>(
      "select herramientas from vertical_template where clave = $1",
      [vertical],
    );
    const herramientas = plantillas[0]?.herramientas ?? ["agendar", "recado"];
    const rapido = herramientas.includes("pedido") || vertical === "restaurante";
    const filas = await q<{ id: string }>(
      `insert into tenant (nombre, vertical, zona_horaria, telefono_escalamiento,
                           slot_granularidad_min, anticipacion_min)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [datos.nombre, vertical, datos.zonaHoraria, datos.telefonoEscalamiento, rapido ? 15 : 30, rapido ? 60 : 120],
    );
    const id = filas[0]!.id;
    await q("insert into tenant_member (tenant_id, user_id, rol) values ($1, $2, 'owner')", [id, usuarioId]);
    await sembrarPlantilla(q, id, vertical);
    return { id, herramientas };
  });
}

const HERRAMIENTAS_VALIDAS: Herramienta[] = ["agendar", "pedido", "recado"];

type GiroPropio = { nombre: string; herramientas: Herramienta[]; descripcion: string };

function giroPropio(fd: FormData): GiroPropio | { error: string } {
  const nombre = texto(fd, "giro_nombre");
  if (!nombre) return { error: "Ponle nombre al giro." };
  if (nombre.length > 60) return { error: "El nombre del giro va en 60 caracteres o menos." };
  const descripcion = texto(fd, "giro_instrucciones");
  if (descripcion.length > 2000) return { error: "La descripción del giro va en 2000 caracteres o menos." };
  const elegidas = fd
    .getAll("giro_herramientas")
    .map(String)
    .filter((h): h is Herramienta => HERRAMIENTAS_VALIDAS.includes(h as Herramienta));
  return { nombre, descripcion, herramientas: elegidas.length > 0 ? elegidas : ["recado"] };
}

/**
 * Un giro que no está en el catálogo se guarda como plantilla propia del
 * negocio: el motor la lee igual que a las de fábrica, el menú de alta no la
 * muestra. La clave lleva un sufijo aleatorio para que dos negocios con el
 * mismo giro no choquen.
 */
async function crearGiroPropio(q: Consulta, giro: GiroPropio): Promise<Vertical> {
  const base = giro.nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const clave = `propio_${base || "giro"}_${Math.random().toString(36).slice(2, 8)}`;
  const instrucciones = [
    `CONTEXTO: ${giro.nombre.toLowerCase()}.`,
    giro.descripcion ? `- ${giro.descripcion}` : null,
    giro.herramientas.includes("agendar") ? "- Agenda solo en horarios que devuelva la herramienta de disponibilidad." : null,
    giro.herramientas.includes("pedido") ? "- Consulta el catalogo antes de decir que hay o cuanto cuesta." : null,
    "- Lo que no puedas resolver, toma recado o transfiere.",
  ]
    .filter(Boolean)
    .join("\n");
  await q(
    `insert into vertical_template (clave, nombre, instrucciones, saludo, herramientas, activo, propio)
     values ($1, $2, $3, $4, $5::jsonb, true, true)`,
    [clave, giro.nombre, instrucciones, "{nombre}, buen dia. ¿En que le puedo ayudar?", JSON.stringify(giro.herramientas)],
  );
  return clave;
}

export async function altaNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  if ((await membresias(usuario.id)).length > 0) return { error: "Esta cuenta ya tiene un negocio." };
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "Ponle nombre al negocio." };
  const giro = await giroElegido(fd);
  if ("error" in giro) return giro;
  const escalamiento = telefonoOpcional(fd, "telefono_escalamiento");
  if (escalamiento === false) return { error: ERROR_TELEFONO };

  let creado: { id: string };
  try {
    creado = await crearNegocio(usuario.id, {
      nombre,
      giro,
      zonaHoraria: texto(fd, "zona_horaria") || "America/Mexico_City",
      telefonoEscalamiento: escalamiento,
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
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
    const modelo = texto(fd, "tts_modelo");
    if (MODELOS_ELEVENLABS.some((m) => m.id === modelo)) ajustes.modelo = modelo;
    return ajustes;
  }
  return {};
}

export async function guardarNegocio(_previo: Estado, fd: FormData): Promise<Estado> {
  const proveedor = (texto(fd, "tts_proveedor") || "azure") as ProveedorTts;
  const proveedorLlm = (texto(fd, "llm_proveedor") || "openai") as ProveedorLlm;
  const voz = opcional(fd, "voz_id");
  if (!texto(fd, "nombre")) return { error: "Ponle nombre al negocio." };

  if (voz && !vozValida(proveedor, voz)) {
    const formato = FORMATO_VOZ[proveedor];
    return {
      error: `"${voz}" no es una voz de ${nombreProveedorTts(proveedor)}. Se espera ${formato.formato}, por ejemplo ${formato.ejemplo}.`,
    };
  }

  const telefonoEntrada = telefonoOpcional(fd, "telefono_entrada");
  if (telefonoEntrada === false) return { error: `Número de entrada: ${ERROR_TELEFONO}` };
  const telefonoEscalamiento = telefonoOpcional(fd, "telefono_escalamiento");
  if (telefonoEscalamiento === false) return { error: `Número para transferir: ${ERROR_TELEFONO}` };

  const granularidad = numero(fd, "slot_granularidad_min", 15);
  const anticipacion = numero(fd, "anticipacion_min", 60);
  const horizonte = numero(fd, "horizonte_dias", 60);
  if (granularidad < 5 || granularidad > 120) return { error: "«Cada (min)» va entre 5 y 120." };
  if (anticipacion < 0) return { error: "La anticipación no puede ser negativa." };
  if (horizonte < 1 || horizonte > 365) return { error: "El horizonte va entre 1 y 365 días." };

  // Candado: el número de entrada solo se guarda cuando el negocio está
  // completo. Un agente a medias contestando el teléfono real queda mal con
  // el cliente, y el dueño no siempre lee el aviso.
  if (telefonoEntrada) {
    const { giro } = await contexto();
    const [progreso, previo] = await Promise.all([avance(giro.herramientas), negocio()]);
    if (!progreso.completo && telefonoEntrada !== previo.telefono_entrada) {
      const faltan = progreso.requisitos.filter((r) => !r.listo).map((r) => r.nombre.toLowerCase());
      return { error: `El número de entrada se activa cuando todo está listo. Falta: ${faltan.join(", ")}.` };
    }
  }

  try {
    const resultado = await datos(async (q, id): Promise<Estado> => {
      if (telefonoEntrada) {
        const ajeno = await q<{ id: string }>(
          "select id from linea where telefono = $2 and tenant_id <> $1 limit 1",
          [id, telefonoEntrada],
        );
        if (ajeno.length > 0) return { error: "Ese número ya está registrado como línea de otro negocio." };
      }
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
          texto(fd, "zona_horaria") || "America/Mexico_City",
          telefonoEntrada,
          telefonoEscalamiento,
          voz,
          granularidad,
          anticipacion,
          horizonte,
          proveedor,
          JSON.stringify(ajustesTts(fd, proveedor)),
          opcional(fd, "instrucciones_extra"),
          proveedorLlm,
          opcional(fd, "llm_modelo"),
          opcional(fd, "instagram_id"),
          opcional(fd, "messenger_page_id"),
        ],
      );
      return {};
    });
    if (resultado.error) return resultado;
  } catch (error) {
    return { error: errorLegible(error, proveedor) };
  }
  refrescarPanel();
  return { ok: "Configuración guardada." };
}

/** Abrirla es haberla leído: baja el contador del menú. */
export async function marcarLeida(conversacionId: string): Promise<void> {
  await intentar(() => datos((q, id) => q("select conversacion_marcar_leida($1, $2)", [id, conversacionId])));
}

/** La primera frase de cada llamada. Vacío usa la de la plantilla del vertical. */
export async function guardarSaludo(_previo: Estado, fd: FormData): Promise<Estado> {
  const propio = opcional(fd, "saludo");
  return intentar(async () => {
    await datos((q, id) => q("update tenant set saludo = $2 where id = $1", [id, propio]));
    return { ok: propio ? "Saludo guardado." : "Saludo de fábrica restaurado." };
  });
}

/** Los grupos y tipos del catálogo se guardan en minúscula, sin espacios ni acentos. */
function normalizarGrupo(crudo: string): string {
  return crudo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export async function agregarGrupoCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const grupo = normalizarGrupo(texto(fd, "grupo"));
  if (!grupo) return { error: "El grupo necesita un nombre." };
  return intentar(async () => {
    await datos((q, id) =>
      q(
        `update tenant
            set tipos_catalogo = (select array_agg(distinct t)
                                    from unnest(tipos_catalogo || array[$2]) as t)
          where id = $1`,
        [id, grupo],
      ),
    );
    return { ok: `Grupo "${grupo}" agregado.` };
  });
}

/** Quita un grupo. Solo si ya no tiene items: si los tiene, se avisa. */
export async function quitarGrupoCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const grupo = texto(fd, "grupo");
  return intentar(() =>
    datos(async (q, id) => {
      const filas = await q<{ total: string }>(
        "select count(*)::text as total from catalogo_item where tenant_id = $1 and tipo = $2",
        [id, grupo],
      );
      const conItems = Number(filas[0]?.total ?? 0);
      if (conItems > 0) return { error: `"${grupo}" todavía tiene ${conItems} items. Muévelos o bórralos primero.` };
      await q("update tenant set tipos_catalogo = array_remove(tipos_catalogo, $2) where id = $1", [id, grupo]);
      return { ok: "Grupo quitado." };
    }),
  );
}

/**
 * Reescribe las instrucciones base del agente. Vacío vuelve a las de fábrica.
 * Los bloques que salen de los datos —servicios, horarios, catálogo, fecha—
 * se siguen generando aparte: aquí solo vive el texto de instrucciones.
 */
export async function guardarPrompt(_previo: Estado, fd: FormData): Promise<Estado> {
  const propio = opcional(fd, "prompt_base");
  return intentar(async () => {
    await datos((q, id) => q("update tenant set prompt_base = $2 where id = $1", [id, propio]));
    return { ok: propio ? "Instrucciones guardadas." : "Instrucciones de fábrica restauradas." };
  });
}

export async function guardarItemCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  const tipo = normalizarGrupo(texto(fd, "tipo"));
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
  if (precio !== null && precio < 0) return { error: "El precio no puede ser negativo." };
  const recurso = opcional(fd, "resource_id");
  const existencias = texto(fd, "existencias") ? Math.max(0, Math.round(numero(fd, "existencias", 0))) : null;
  const orden = Math.round(numero(fd, "orden"));

  return intentar(() =>
    datos(async (q, negocioId) => {
      const parametros = [
        negocioId,
        tipo,
        nombre,
        opcional(fd, "descripcion"),
        precio,
        alias,
        atributos,
        recurso,
        orden,
        existencias,
      ];
      if (id) {
        // Reponer existencias vuelve a ofrecer lo que el motor apagó al llegar a cero.
        await q(
          `update catalogo_item
              set tipo = $2, nombre = $3, descripcion = $4, precio = $5,
                  alias = $6::jsonb, atributos = $7::jsonb,
                  resource_id = (select r.id from resource r where r.id = $8 and r.tenant_id = $1),
                  orden = $9, existencias = $10,
                  disponible = case when coalesce($10::int, 1) > 0 and existencias = 0 and not disponible then true else disponible end
            where id = $11 and tenant_id = $1`,
          [...parametros, id],
        );
      } else {
        await q(
          `insert into catalogo_item
           (tenant_id, tipo, nombre, descripcion, precio, alias, atributos, resource_id, orden, existencias)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb,
                   (select r.id from resource r where r.id = $8 and r.tenant_id = $1), $9, $10)`,
          parametros,
        );
      }
      await q(
        `update tenant
            set tipos_catalogo = (select array_agg(distinct t) from unnest(tipos_catalogo || array[$2]) as t)
          where id = $1 and not ($2 = any(tipos_catalogo))`,
        [negocioId, tipo],
      );
      return { ok: "Item guardado." };
    }),
  );
}

export async function alternarDisponible(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) =>
      q("update catalogo_item set disponible = not disponible where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId]),
    ),
  );
}

export async function eliminarItemCatalogo(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("delete from catalogo_item where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId])),
  );
}

export async function probarCatalogo(consulta: string, tipo: string | null): Promise<ResultadoCatalogo[]> {
  return datos((q, negocioId) =>
    q<ResultadoCatalogo>("select * from public.buscar_catalogo($1, $2, $3, 8)", [negocioId, consulta, tipo]),
  );
}

export async function guardarRecurso(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "El recurso necesita un nombre." };
  const id = opcional(fd, "id");
  const capacidad = Math.max(1, Math.round(numero(fd, "capacidad", 1)));
  const etiqueta = opcional(fd, "etiqueta");
  const metadatos = etiqueta ? JSON.stringify({ etiqueta }) : "{}";
  const tipo = texto(fd, "tipo") === "persona" ? "persona" : "lugar";
  const comision = texto(fd, "comision_pct") ? Math.min(100, Math.max(0, numero(fd, "comision_pct", 0))) : null;
  const telefono = telefonoOpcional(fd, "telefono");
  if (telefono === false) return { error: ERROR_TELEFONO };
  return intentar(() =>
    datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update resource set nombre = $2, capacidad = $3, metadatos = $4::jsonb, tipo = $5, telefono = $6, correo = $7, comision_pct = $8
            where id = $1 and tenant_id = $9`,
          [id, nombre, capacidad, metadatos, tipo, telefono, opcional(fd, "correo"), comision, negocioId],
        );
      } else {
        await q(
          `insert into resource (tenant_id, nombre, capacidad, metadatos, tipo, telefono, correo, comision_pct)
           values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
          [negocioId, nombre, capacidad, metadatos, tipo, telefono, opcional(fd, "correo"), comision],
        );
      }
      return { ok: "Recurso guardado." };
    }),
  );
}

export async function guardarServicio(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  if (!nombre) return { error: "El servicio necesita un nombre." };
  const duracion = numero(fd, "duracion_min", 0);
  if (duracion <= 0) return { error: "La duración debe ser mayor a cero." };
  const buffer = Math.max(0, numero(fd, "buffer_min"));
  const alias = JSON.stringify(
    texto(fd, "alias")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
  );
  const recursos = JSON.stringify(fd.getAll("recursos_validos").map(String));
  const precio = texto(fd, "precio") ? numero(fd, "precio") : null;
  if (precio !== null && precio < 0) return { error: "El precio no puede ser negativo." };
  const id = opcional(fd, "id");
  return intentar(() =>
    datos(async (q, negocioId) => {
      if (id) {
        await q(
          `update service set nombre = $2, alias = $3::jsonb, duracion_min = $4, buffer_min = $5,
                  precio = $6, recursos_validos = $7::jsonb where id = $1 and tenant_id = $8`,
          [id, nombre, alias, duracion, buffer, precio, recursos, negocioId],
        );
      } else {
        await q(
          `insert into service (tenant_id, nombre, alias, duracion_min, buffer_min, precio, recursos_validos)
           values ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)`,
          [negocioId, nombre, alias, duracion, buffer, precio, recursos],
        );
      }
      return { ok: "Servicio guardado." };
    }),
  );
}

export type ReglaNueva = Omit<Regla, "id">;

const HORA = /^\d{2}:\d{2}$/;

function reglaValida(r: ReglaNueva): boolean {
  return (
    TIPOS_REGLA.includes(r.tipo) &&
    r.dia_semana !== null &&
    Number.isInteger(r.dia_semana) &&
    r.dia_semana >= 0 &&
    r.dia_semana <= 6 &&
    HORA.test(r.hora_inicio) &&
    HORA.test(r.hora_fin) &&
    r.hora_fin > r.hora_inicio
  );
}

/**
 * Reescribe la semana tipo. Solo toca los alcances que el editor conoce
 * (`recursos`): el horario de un recurso que no se le pasó queda como estaba.
 */
export async function guardarHorario(reglas: ReglaNueva[], recursos: string[]): Promise<Estado> {
  if (!reglas.every(reglaValida)) return { error: "Hay una franja mal formada. Recarga y vuelve a intentar." };
  if (!reglas.every((r) => r.resource_id === null || recursos.includes(r.resource_id))) {
    return { error: "Hay una franja de un recurso que no está en el editor." };
  }
  return intentar(() =>
    datos(async (q, id) => {
      await q(
        "delete from schedule_rule where tenant_id = $1 and fecha is null and (resource_id is null or resource_id = any($2::uuid[]))",
        [id, recursos],
      );
      if (reglas.length > 0) {
        await q(
          `insert into schedule_rule (tenant_id, resource_id, tipo, dia_semana, hora_inicio, hora_fin)
           select $1, r.resource_id, r.tipo::text, r.dia_semana, r.hora_inicio, r.hora_fin
             from unnest($2::uuid[], $3::text[], $4::int[], $5::time[], $6::time[])
               as r(resource_id, tipo, dia_semana, hora_inicio, hora_fin)
            where r.resource_id is null or exists (select 1 from resource x where x.id = r.resource_id and x.tenant_id = $1)`,
          [
            id,
            reglas.map((r) => r.resource_id),
            reglas.map((r) => r.tipo),
            reglas.map((r) => r.dia_semana),
            reglas.map((r) => r.hora_inicio),
            reglas.map((r) => r.hora_fin),
          ],
        );
      }
      return { ok: "Horario guardado." };
    }),
  );
}

/** Una ausencia: la persona no atiende esos días. Es un bloqueo por fecha con motivo. */
export async function guardarAusencia(_previo: Estado, fd: FormData): Promise<Estado> {
  const recurso = texto(fd, "resource_id");
  const desde = texto(fd, "desde");
  const hasta = texto(fd, "hasta") || desde;
  if (!recurso) return { error: "Elige a quién." };
  if (!desde) return { error: "Elige desde cuándo." };
  if (!fechaValida(desde) || !fechaValida(hasta)) return { error: "Las fechas van como AAAA-MM-DD." };
  if (hasta < desde) return { error: "El fin no puede ser antes del inicio." };
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000) + 1;
  if (dias > 62) return { error: "Máximo dos meses seguidos." };
  return intentar(() =>
    datos(async (q, id) => {
      const persona = await q<{ id: string }>(
        "select id from resource where id = $2 and tenant_id = $1 and tipo = 'persona' and activo",
        [id, recurso],
      );
      if (persona.length === 0) return { error: "Elige a una persona activa del equipo." };
      await q(
        `insert into schedule_rule (tenant_id, resource_id, tipo, fecha, hora_inicio, hora_fin, motivo)
         select $1, $2, 'bloqueo', d::date, '00:00'::time, '23:59'::time, $5
           from generate_series($3::date, $4::date, interval '1 day') d`,
        [id, recurso, desde, hasta, opcional(fd, "motivo")],
      );
      return { ok: dias === 1 ? "Ausencia guardada." : `${dias} días bloqueados.` };
    }),
  );
}

export async function guardarExcepcion(_previo: Estado, fd: FormData): Promise<Estado> {
  const fecha = texto(fd, "fecha");
  if (!fecha) return { error: "Elige una fecha." };
  if (!fechaValida(fecha)) return { error: "La fecha va como AAAA-MM-DD." };
  const tipo = (texto(fd, "tipo") || "festivo") as TipoRegla;
  if (!TIPOS_REGLA.includes(tipo)) return { error: "Elige qué pasa ese día." };
  const inicio = texto(fd, "hora_inicio") || "00:00";
  const fin = texto(fd, "hora_fin") || "23:59";
  if (!HORA.test(inicio) || !HORA.test(fin)) return { error: "Las horas van como HH:MM." };
  if (fin <= inicio) return { error: "La hora de fin debe ser después de la de inicio." };
  return intentar(async () => {
    await datos((q, id) =>
      q(
        `insert into schedule_rule (tenant_id, tipo, fecha, hora_inicio, hora_fin)
         values ($1, $2, $3::date, $4::time, $5::time)`,
        [id, tipo, fecha, inicio, fin],
      ),
    );
    return { ok: "Excepción agregada." };
  });
}

export async function eliminarRegla(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("delete from schedule_rule where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId])),
  );
}

export async function guardarFaq(_previo: Estado, fd: FormData): Promise<Estado> {
  const pregunta = texto(fd, "pregunta");
  const respuesta = texto(fd, "respuesta");
  if (!pregunta || !respuesta) return { error: "Faltan la pregunta o la respuesta." };
  const id = opcional(fd, "id");
  const prioridad = Math.round(numero(fd, "prioridad"));
  return intentar(() =>
    datos(async (q, negocioId) => {
      if (id) {
        await q("update knowledge set pregunta = $2, respuesta = $3, prioridad = $4 where id = $1 and tenant_id = $5", [
          id,
          pregunta,
          respuesta,
          prioridad,
          negocioId,
        ]);
      } else {
        await q("insert into knowledge (tenant_id, pregunta, respuesta, prioridad) values ($1, $2, $3, $4)", [
          negocioId,
          pregunta,
          respuesta,
          prioridad,
        ]);
      }
      return { ok: "Respuesta guardada." };
    }),
  );
}

export async function eliminarFaq(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("delete from knowledge where id = $1 and tenant_id = $2", [texto(fd, "id"), negocioId])),
  );
}

export async function cancelarReserva(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("select public.cancelar_reserva($1, $2)", [negocioId, texto(fd, "id")])),
  );
}

export async function guardarCliente(_previo: Estado, fd: FormData): Promise<Estado> {
  const id = texto(fd, "id");
  const etiquetas = texto(fd, "etiquetas")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return intentar(async () => {
    await datos((q, negocioId) =>
      q(
        `update cliente
            set nombre = $3, correo = $4, notas = $5, etiquetas = $6::text[], actualizado = now()
          where id = $2 and tenant_id = $1`,
        [negocioId, id, opcional(fd, "nombre"), opcional(fd, "correo"), opcional(fd, "notas"), etiquetas],
      ),
    );
    return { ok: "Cliente guardado." };
  });
}

const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia", "enlace", "otro"];

/** Registra lo que de verdad se cobró por una cita o un pedido. */
export async function registrarPago(_previo: Estado, fd: FormData): Promise<Estado> {
  const monto = numero(fd, "monto", 0);
  if (!(monto > 0)) return { error: "Escribe un monto mayor a cero." };
  const metodo = texto(fd, "metodo");
  if (!METODOS_PAGO.includes(metodo)) return { error: "Elige cómo se pagó." };
  const enlace = opcional(fd, "enlace_url");
  if (enlace && !/^https?:\/\//.test(enlace)) return { error: "El enlace debe empezar con https://" };
  const pendiente = fd.get("pendiente") === "1";
  const bookingId = opcional(fd, "booking_id");
  const pedidoId = opcional(fd, "pedido_id");
  return intentar(() =>
    datos(async (q, negocioId) => {
      const filas = await q<{ id: string }>(
        `insert into pago (tenant_id, booking_id, pedido_id, concepto, monto, metodo, estado, enlace_url, referencia_externa, notas)
         select $1,
                (select b.id from booking b where b.id = $2 and b.tenant_id = $1),
                (select p.id from pedido p where p.id = $3 and p.tenant_id = $1),
                $4, $5, $6::pago_metodo, $7::pago_estado, $8, $9, $10
          where ($2::uuid is null or exists (select 1 from booking b where b.id = $2 and b.tenant_id = $1))
            and ($3::uuid is null or exists (select 1 from pedido p where p.id = $3 and p.tenant_id = $1))
         returning id`,
        [
          negocioId,
          bookingId,
          pedidoId,
          texto(fd, "concepto") || "Cobro",
          monto,
          metodo,
          pendiente ? "pendiente" : "pagado",
          enlace,
          opcional(fd, "referencia"),
          opcional(fd, "notas"),
        ],
      );
      if (filas.length === 0) return { error: "La cita o el pedido ya no existe." };
      return { ok: pendiente ? "Cobro pendiente registrado." : "Cobro registrado." };
    }),
  );
}

export async function cambiarEstadoPago(_previo: Estado, fd: FormData): Promise<Estado> {
  const estado = texto(fd, "estado");
  if (!["pagado", "cancelado", "reembolsado"].includes(estado)) return { error: "Estado desconocido." };
  return intentar(() =>
    datos((q, negocioId) =>
      q(
        `update pago set estado = $3::pago_estado, pagado_en = case when $3 = 'pagado' then now() else pagado_en end, actualizado = now()
          where id = $2 and tenant_id = $1`,
        [negocioId, texto(fd, "id"), estado],
      ),
    ),
  );
}

const TIPOS_CAMPANA = ["no_show", "inactivos", "recordatorio_pago", "resena", "marketing", "manual"];

/** Cuántas personas alcanzaría una campaña con este criterio; lo consulta el formulario al cambiar los días. */
export async function alcanceDeCampana(tipo: string, dias: number): Promise<number> {
  if (!TIPOS_CAMPANA.includes(tipo)) return 0;
  return alcanceCampana(tipo, Math.max(1, Math.min(365, Math.round(dias) || 30)));
}

export async function crearCampana(_previo: Estado, fd: FormData): Promise<Estado> {
  const nombre = texto(fd, "nombre");
  const tipo = texto(fd, "tipo");
  const canal = texto(fd, "canal") === "llamada" ? "llamada" : "whatsapp";
  const mensaje = texto(fd, "mensaje");
  if (!nombre) return { error: "Ponle nombre a la campaña." };
  if (!TIPOS_CAMPANA.includes(tipo)) return { error: "Elige a quién va dirigida." };
  if (!mensaje) return { error: canal === "llamada" ? "Escribe el guion de la llamada." : "Escribe el mensaje." };
  const dias = Math.max(1, Math.min(365, Math.round(numero(fd, "dias", 30))));
  const inicio = texto(fd, "ventana_inicio") || "10:00";
  const fin = texto(fd, "ventana_fin") || "19:00";
  if (!HORA.test(inicio) || !HORA.test(fin) || fin <= inicio) return { error: "La ventana de horario está mal: el fin va después del inicio." };
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
          inicio,
          fin,
          Math.max(1, Math.min(5, Math.round(numero(fd, "max_intentos", 2)))),
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

export async function cambiarEstadoCampana(_previo: Estado, fd: FormData): Promise<Estado> {
  const estado = texto(fd, "estado");
  if (!["activa", "pausada", "terminada"].includes(estado)) return { error: "Estado desconocido." };
  return intentar(() =>
    datos(async (q, negocioId) => {
      const filas = await q<{ id: string }>(
        "update campana set estado = $3::campana_estado, actualizado = now() where id = $2 and tenant_id = $1 returning id",
        [negocioId, texto(fd, "id"), estado],
      );
      const propia = filas[0]?.id;
      if (!propia) return { error: "Esa campaña no es de este negocio." };
      if (estado === "activa") await q("select public.campana_poblar($1)", [propia]);
      return {};
    }),
  );
}

export async function agregarContactosCampana(_previo: Estado, fd: FormData): Promise<Estado> {
  const campanaId = texto(fd, "campana_id");
  const segmento = texto(fd, "segmento") as SegmentoCliente;
  const condicion = CONDICION_SEGMENTO[segmento];
  if (!condicion) return { error: "Elige un segmento." };
  return intentar(() =>
    datos((q, negocioId) =>
      q(
        `insert into campana_contacto (campana_id, tenant_id, cliente_id)
         select ca.id, $1, c.id
           from campana ca, cliente c
          where ca.id = $2 and ca.tenant_id = $1
            and c.tenant_id = $1 and c.telefono is not null and ${condicion}
         on conflict do nothing`,
        [negocioId, campanaId],
      ),
    ),
  );
}

export async function excluirContacto(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) =>
      q("select public.campana_contacto_resultado(cc.id, 'excluido') from campana_contacto cc where cc.id = $2 and cc.tenant_id = $1", [
        negocioId,
        texto(fd, "id"),
      ]),
    ),
  );
}

/** Un número de entrada extra ligado a una campaña: quien marque ahí queda atribuido. */
export async function guardarLinea(_previo: Estado, fd: FormData): Promise<Estado> {
  const tel = normalizarTelefono(texto(fd, "telefono"));
  const etiqueta = texto(fd, "etiqueta");
  if (!TELEFONO_E164.test(tel)) return { error: ERROR_TELEFONO };
  if (!etiqueta) return { error: "Ponle etiqueta: de dónde viene quien marca ahí." };
  const campanaId = opcional(fd, "campana_id");
  try {
    const resultado = await datos(async (q, negocioId): Promise<Estado> => {
      const entrada = await q<{ id: string }>("select id from tenant where telefono_entrada = $1 limit 1", [tel]);
      if (entrada.length > 0) return { error: "Ese número ya es el número de entrada de un negocio." };
      const filas = await q<{ id: string }>(
        `insert into linea (tenant_id, telefono, etiqueta, campana_id)
         select $1, $2, $3, (select ca.id from campana ca where ca.id = $4 and ca.tenant_id = $1)
          where $4::uuid is null or exists (select 1 from campana ca where ca.id = $4 and ca.tenant_id = $1)
         returning id`,
        [negocioId, tel, etiqueta, campanaId],
      );
      if (filas.length === 0) return { error: "Esa campaña no es de este negocio." };
      return { ok: "Línea agregada." };
    });
    if (resultado.error) return resultado;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    return { error: /unique|duplicate/i.test(mensaje) ? "Ese número ya está registrado." : errorLegible(error) };
  }
  refrescarPanel();
  return { ok: "Línea agregada." };
}

export async function eliminarLinea(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("delete from linea where id = $2 and tenant_id = $1", [negocioId, texto(fd, "id")])),
  );
}

export async function guardarResenas(_previo: Estado, fd: FormData): Promise<Estado> {
  const espera = Math.max(15, Math.min(1440, Math.round(numero(fd, "resena_espera_min", 120))));
  const url = opcional(fd, "resena_url");
  if (url && !/^https?:\/\//.test(url)) return { error: "La liga debe empezar con https://" };
  return intentar(async () => {
    await datos((q, negocioId) =>
      q("update tenant set resena_activa = $2, resena_url = $3, resena_espera_min = $4 where id = $1", [
        negocioId,
        fd.get("resena_activa") === "on",
        url,
        espera,
      ]),
    );
    return { ok: "Reseñas guardadas." };
  });
}

export type PasoFlujo = "llego" | "atendida" | "no_llego" | "regresar";

const CAMBIOS_PASO: Record<PasoFlujo, string> = {
  llego: "llegada = now()",
  regresar: "llegada = null",
  atendida: "estado = 'completada', llegada = coalesce(llegada, now())",
  no_llego: "estado = 'no_asistio'",
};

/**
 * Mueve una cita dentro del día. `llego` y `regresar` solo tocan `llegada`,
 * así la cita sigue confirmada y sigue bloqueando su horario mientras se atiende.
 */
export async function moverCita(_previo: Estado, fd: FormData): Promise<Estado> {
  const cambio = CAMBIOS_PASO[texto(fd, "paso") as PasoFlujo];
  if (!cambio) return { error: "Paso desconocido." };
  return intentar(() =>
    datos((q, negocioId) =>
      q(`update booking set ${cambio} where id = $2 and tenant_id = $1 and estado = 'confirmada'`, [negocioId, texto(fd, "id")]),
    ),
  );
}

export type Slot = { inicio: string; fin: string; resource_id: string; resource_nombre: string };

export async function slotsLibres(servicioId: string, dia: string, personas: number): Promise<Slot[]> {
  if (!fechaValida(dia)) return [];
  return datos((q, negocioId) =>
    q<Slot>("select * from public.slots_libres($1, $2, $3::date, $4, 40)", [
      negocioId,
      servicioId,
      dia,
      Math.max(1, Math.round(personas) || 1),
    ]),
  );
}

/** Mueve la cita al horario y al recurso elegidos: el slot que se mostró es el que se toma. */
export async function reagendarReserva(reservaId: string, inicio: string, recursoId: string): Promise<Estado> {
  if (Number.isNaN(Date.parse(inicio))) return { error: "Elige un horario." };
  try {
    const movidas = await datos(async (q, id) => {
      const filas = await q<{ id: string }>(
        `update booking b
            set inicio = $3::timestamptz,
                fin = $3::timestamptz + make_interval(mins => s.duracion_min + s.buffer_min),
                resource_id = r.id
           from service s, resource r
          where b.id = $2 and b.tenant_id = $1 and s.id = b.service_id and b.estado = 'confirmada'
            and r.id = $4 and r.tenant_id = $1 and r.activo
          returning b.id`,
        [id, reservaId, inicio, recursoId],
      );
      return filas.length;
    });
    if (movidas === 0) return { error: "La reserva ya no está confirmada o el recurso no está activo." };
  } catch {
    return { error: "Ese horario acaba de ocuparse. Elige otro." };
  }
  refrescarPanel();
  return { ok: "Reserva movida." };
}

export async function crearReserva(_previo: Estado, fd: FormData): Promise<Estado> {
  const telefono = normalizarTelefono(texto(fd, "telefono"));
  if (!TELEFONO_E164.test(telefono)) return { error: ERROR_TELEFONO };
  if (!texto(fd, "cliente_nombre")) return { error: "Escribe el nombre." };
  if (Number.isNaN(Date.parse(texto(fd, "inicio")))) return { error: "Elige un horario." };
  let resultado: { ok: boolean; error?: string; codigo?: string };
  try {
    resultado = await datos(async (q, negocioId) => {
      const filas = await q<{ reservar: { ok: boolean; error?: string; codigo?: string } }>(
        "select public.reservar($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, null) as reservar",
        [
          negocioId,
          texto(fd, "service_id"),
          texto(fd, "resource_id"),
          texto(fd, "inicio"),
          texto(fd, "cliente_nombre"),
          telefono,
          Math.max(1, Math.round(numero(fd, "personas", 1))),
          opcional(fd, "notas"),
        ],
      );
      return filas[0]!.reservar;
    });
  } catch (error) {
    return { error: errorLegible(error) };
  }
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

export async function estadoPrueba(minutos: number): Promise<EstadoPrueba> {
  return datos(async (q, id) => {
    const pedidos = await q<{ id: string; resumen: Omit<ResumenPedidoPrueba, "id"> | null }>(
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

export async function cambiarEstadoPedido(_previo: Estado, fd: FormData): Promise<Estado> {
  const estado = texto(fd, "estado") as EstadoPedido;
  if (!ESTADOS_PEDIDO.includes(estado)) return { error: "Estado desconocido." };
  return intentar(() =>
    datos((q, negocioId) =>
      q("update pedido set estado = $3::pedido_estado where id = $2 and tenant_id = $1", [negocioId, texto(fd, "id"), estado]),
    ),
  );
}

export async function alternarRecado(_previo: Estado, fd: FormData): Promise<Estado> {
  return intentar(() =>
    datos((q, negocioId) => q("update lead set atendido = not atendido where id = $2 and tenant_id = $1", [negocioId, texto(fd, "id")])),
  );
}

/** Cambia el negocio activo de la cuenta, solo entre los que tiene. */
export async function cambiarNegocio(formData: FormData): Promise<void> {
  const id = String(formData.get("negocio") ?? "");
  const { membresias: lista } = await contexto();
  if (!lista.some((m) => m.tenant_id === id)) return;
  await elegirNegocio(id);
  redirect("/hoy");
}

// ---------------------------------------------------------------
// Pagos: pasarelas, enlaces y terminales.
// ---------------------------------------------------------------

import { headers } from "next/headers";
import { CAMPOS_CREDENCIALES, CAPACIDADES, esProveedor, pasarela, urlWebhook, type Credenciales, type Proveedor, type Terminal } from "@/lib/pagos";

async function origenPublico(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return process.env.PANEL_URL ?? `${proto}://${host}`;
}

async function integracionDe(q: Consulta, negocioId: string, proveedor: Proveedor) {
  const filas = await q<{ credenciales: Credenciales; config: Record<string, string> }>(
    `select credenciales, config from integracion where tenant_id = $1 and proveedor = $2 and activo`,
    [negocioId, proveedor],
  );
  return filas[0] ?? null;
}

export async function guardarIntegracion(_previo: Estado, fd: FormData): Promise<Estado> {
  const proveedor = texto(fd, "proveedor");
  if (!esProveedor(proveedor)) return { error: "Pasarela desconocida." };
  const credenciales: Credenciales = {};
  for (const campo of CAMPOS_CREDENCIALES[proveedor]) {
    const v = texto(fd, campo.clave);
    if (v && v !== "••••••••") credenciales[campo.clave] = v;
  }
  return intentar(() =>
    datos(async (q, negocioId) => {
      const previa = await q<{ credenciales: Credenciales }>(`select credenciales from integracion where tenant_id = $1 and proveedor = $2`, [
        negocioId,
        proveedor,
      ]);
      const fusion = { ...(previa[0]?.credenciales ?? {}), ...credenciales };
      const obligatorio = CAMPOS_CREDENCIALES[proveedor][0]!.clave;
      if (!fusion[obligatorio]) return { error: `Falta ${CAMPOS_CREDENCIALES[proveedor][0]!.nombre.toLowerCase()}.` };
      await q(
        `insert into integracion (tenant_id, proveedor, credenciales, activo)
         values ($1, $2, $3::jsonb, true)
         on conflict (tenant_id, proveedor) do update set credenciales = excluded.credenciales, activo = true`,
        [negocioId, proveedor, JSON.stringify(fusion)],
      );
      revalidatePath("/pagos");
      return { ok: "Pasarela conectada." };
    }),
  );
}

export async function apagarIntegracion(fd: FormData): Promise<void> {
  const proveedor = texto(fd, "proveedor");
  if (!esProveedor(proveedor)) return;
  await datos((q, negocioId) => q(`update integracion set activo = false where tenant_id = $1 and proveedor = $2`, [negocioId, proveedor]));
  revalidatePath("/pagos");
}

export async function guardarTerminalPredeterminada(fd: FormData): Promise<void> {
  const proveedor = texto(fd, "proveedor");
  const terminal = texto(fd, "terminal");
  if (!esProveedor(proveedor)) return;
  await datos((q, negocioId) =>
    q(`update integracion set config = config || jsonb_build_object('terminal', $3::text) where tenant_id = $1 and proveedor = $2`, [
      negocioId,
      proveedor,
      terminal,
    ]),
  );
  revalidatePath("/pagos");
}

/** Prueba la conexión: con terminal, lista los dispositivos; sin terminal, valida creando nada. */
export async function probarIntegracion(proveedor: Proveedor): Promise<{ ok: boolean; mensaje: string; terminales?: Terminal[] }> {
  if (!esProveedor(proveedor)) return { ok: false, mensaje: "Pasarela desconocida." };
  try {
    return await datos(async (q, negocioId) => {
      const i = await integracionDe(q, negocioId, proveedor);
      if (!i) return { ok: false, mensaje: "Aún no hay credenciales guardadas." };
      const p = pasarela(proveedor);
      if (p.listarTerminales) {
        const terminales = await p.listarTerminales(i.credenciales);
        return {
          ok: true,
          mensaje: terminales.length ? `${terminales.length} ${terminales.length === 1 ? "terminal encontrada" : "terminales encontradas"}.` : "Conecta, pero no hay terminales ligadas a esta cuenta.",
          terminales,
        };
      }
      return { ok: true, mensaje: "Credenciales guardadas. La prueba real es el primer enlace." };
    });
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo conectar." };
  }
}

export type OpcionesCobro = {
  enlaces: Proveedor[];
  terminales: { proveedor: Proveedor; id: string; nombre: string; predeterminada: boolean }[];
};

/** Qué formas de cobrar tiene este negocio además de efectivo: para armar el diálogo. */
export async function opcionesCobro(): Promise<OpcionesCobro> {
  return datos(async (q, negocioId) => {
    const filas = await q<{ proveedor: Proveedor; credenciales: Credenciales; config: Record<string, string> }>(
      `select proveedor, credenciales, config from integracion where tenant_id = $1 and activo`,
      [negocioId],
    );
    const enlaces = filas.filter((f) => CAPACIDADES[f.proveedor].enlace).map((f) => f.proveedor);
    const terminales: OpcionesCobro["terminales"] = [];
    for (const f of filas) {
      const p = pasarela(f.proveedor);
      if (!CAPACIDADES[f.proveedor].terminal || !p.listarTerminales) continue;
      try {
        const lista = await p.listarTerminales(f.credenciales);
        for (const t of lista) terminales.push({ proveedor: f.proveedor, id: t.id, nombre: t.nombre, predeterminada: f.config.terminal === t.id });
      } catch {}
    }
    return { enlaces, terminales };
  });
}

export type EstadoCobroIniciado = Estado & { pagoId?: string; enlace?: string; referencia?: string; modo?: "enlace" | "terminal" };

/**
 * Cobra por enlace o en terminal: crea el pago pendiente con la referencia de
 * la pasarela; el webhook (o la consulta de estado) lo marca pagado.
 */
export async function iniciarCobro(_previo: EstadoCobroIniciado, fd: FormData): Promise<EstadoCobroIniciado> {
  const monto = numero(fd, "monto", 0);
  if (!(monto > 0)) return { error: "Escribe un monto mayor a cero." };
  const modo = texto(fd, "modo");
  const proveedor = texto(fd, "proveedor");
  if (!esProveedor(proveedor)) return { error: "Elige con qué cobrar." };
  const terminalId = opcional(fd, "terminal");
  if (modo === "terminal" && !terminalId) return { error: "Elige la terminal." };
  const bookingId = opcional(fd, "booking_id");
  const pedidoId = opcional(fd, "pedido_id");
  const concepto = texto(fd, "concepto") || "Cobro";
  const origen = await origenPublico();

  try {
    return await datos(async (q, negocioId) => {
      const i = await integracionDe(q, negocioId, proveedor);
      if (!i) return { error: "Esa pasarela no está conectada." };
      const p = pasarela(proveedor);
      const pagoId = crypto.randomUUID();
      const clienteId = (
        await q<{ cliente_id: string | null }>(
          `select coalesce((select cliente_id from booking where id = $1 and tenant_id = $3), (select cliente_id from pedido where id = $2 and tenant_id = $3)) as cliente_id`,
          [bookingId, pedidoId, negocioId],
        )
      )[0]?.cliente_id;

      if (modo === "enlace") {
        const enlace = await p.crearEnlace(i.credenciales, {
          pagoId,
          monto,
          moneda: "MXN",
          concepto,
          urlWebhook: urlWebhook(origen, proveedor, negocioId),
          urlVolver: `${origen}/gracias`,
        });
        await q(
          `insert into pago (id, tenant_id, cliente_id, booking_id, pedido_id, concepto, monto, metodo, estado, proveedor, enlace_url, referencia_externa, datos)
           values ($1, $2, $3, $4, $5, $6, $7, 'enlace', 'pendiente', $8, $9, $10, jsonb_build_object('preferencia', $10::text))`,
          [pagoId, negocioId, clienteId ?? null, bookingId, pedidoId, concepto, monto, proveedor, enlace.url, enlace.referencia],
        );
        revalidatePath("/cobros");
        return { ok: clienteId ? "Enlace creado y enviado por WhatsApp." : "Enlace creado.", pagoId, enlace: enlace.url, modo: "enlace" };
      }

      if (!p.cobrarEnTerminal) return { error: "Esa pasarela no cobra en terminal." };
      const intento = await p.cobrarEnTerminal(i.credenciales, { terminalId: terminalId!, pagoId, monto, concepto });
      await q(
        `insert into pago (id, tenant_id, cliente_id, booking_id, pedido_id, concepto, monto, metodo, estado, proveedor, referencia_externa, datos)
         values ($1, $2, $3, $4, $5, $6, $7, 'tarjeta', 'pendiente', $8, $9, jsonb_build_object('intento', $9::text, 'terminal', $10::text))`,
        [pagoId, negocioId, clienteId ?? null, bookingId, pedidoId, concepto, monto, proveedor, intento.referencia, terminalId],
      );
      return { ok: "Monto enviado a la terminal.", pagoId, referencia: intento.referencia, modo: "terminal" };
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "La pasarela no respondió." };
  }
}

/** Pregunta a la pasarela cómo va un cobro en terminal y cierra el pago si ya se aprobó. */
export async function estadoCobro(pagoId: string): Promise<{ estado: "abierto" | "pagado" | "cancelado" | "error"; mensaje?: string }> {
  try {
    return await datos(async (q, negocioId) => {
      const fila = (
        await q<{ estado: string; proveedor: Proveedor | null; referencia_externa: string | null; datos: { intento?: string; terminal?: string } }>(
          `select estado, proveedor, referencia_externa, datos from pago where id = $1 and tenant_id = $2`,
          [pagoId, negocioId],
        )
      )[0];
      if (!fila) return { estado: "error", mensaje: "No encuentro el pago." };
      if (fila.estado === "pagado") return { estado: "pagado" };
      if (fila.estado === "cancelado") return { estado: "cancelado" };
      if (!fila.proveedor) return { estado: "abierto" };
      const i = await integracionDe(q, negocioId, fila.proveedor);
      const p = pasarela(fila.proveedor);
      const ref = fila.datos.intento ?? fila.referencia_externa;
      if (!i || !p.estadoIntento || !ref) return { estado: "abierto" };
      const r = await p.estadoIntento(i.credenciales, ref);
      if (r.estado === "pagado") {
        await q(
          `update pago set estado = 'pagado', pagado_en = now(), referencia_externa = coalesce($3, referencia_externa) where id = $1 and tenant_id = $2 and estado = 'pendiente'`,
          [pagoId, negocioId, r.referenciaPago ?? null],
        );
        revalidatePath("/cobros");
        revalidatePath("/agenda");
        revalidatePath("/pedidos");
      } else if (r.estado === "cancelado" || r.estado === "error") {
        await q(`update pago set estado = 'cancelado' where id = $1 and tenant_id = $2 and estado = 'pendiente'`, [pagoId, negocioId]);
      }
      return { estado: r.estado };
    });
  } catch (e) {
    return { estado: "error", mensaje: e instanceof Error ? e.message : "Sin respuesta." };
  }
}

/** Cancela un cobro que sigue abierto en la terminal. */
export async function cancelarCobroTerminal(pagoId: string): Promise<Estado> {
  return intentar(() =>
    datos(async (q, negocioId) => {
      const fila = (
        await q<{ proveedor: Proveedor | null; datos: { intento?: string; terminal?: string } }>(
          `select proveedor, datos from pago where id = $1 and tenant_id = $2 and estado = 'pendiente'`,
          [pagoId, negocioId],
        )
      )[0];
      if (!fila?.proveedor || !fila.datos.intento || !fila.datos.terminal) return { error: "Ese cobro ya no está abierto." };
      const i = await integracionDe(q, negocioId, fila.proveedor);
      const p = pasarela(fila.proveedor);
      if (i && p.cancelarIntento) await p.cancelarIntento(i.credenciales, fila.datos.terminal, fila.datos.intento).catch(() => undefined);
      await q(`update pago set estado = 'cancelado' where id = $1 and tenant_id = $2`, [pagoId, negocioId]);
      return { ok: "Cobro cancelado." };
    }),
  );
}

// ---------------------------------------------------------------
// Copiloto: pregunta con datos del negocio y propone acciones.
// ---------------------------------------------------------------

import { conversar, type Propuesta, type RespuestaCopiloto, type TurnoCopiloto } from "@/lib/copiloto";
import { recursos as listarRecursos, servicios as listarServicios } from "@/lib/consultas";

export async function preguntarCopiloto(historial: TurnoCopiloto[]): Promise<RespuestaCopiloto> {
  const { membresias: lista, negocioId } = await contexto();
  const [config, servicios, recursosLista] = await Promise.all([negocio(), listarServicios(), listarRecursos()]);
  return datos((q, id) =>
    conversar({ q, negocioId: id, negocio: config, membresia: lista.find((m) => m.tenant_id === negocioId), servicios, recursos: recursosLista }, historial),
  );
}

/** Ejecuta lo que el copiloto propuso, ya con la aprobación del dueño, usando las mismas acciones del panel. */
export async function ejecutarPropuesta(p: Propuesta): Promise<Estado> {
  const fd = new FormData();
  const pon = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") fd.set(k, String(v));
  };
  const a = p.args;
  switch (p.accion) {
    case "campana":
      pon("nombre", a.nombre);
      pon("tipo", a.tipo);
      pon("canal", a.canal);
      pon("mensaje", a.mensaje);
      pon("dias", a.dias ?? 30);
      return crearCampana({}, fd);
    case "bloqueo":
      pon("resource_id", a.resource_id);
      pon("desde", a.desde);
      pon("hasta", a.hasta ?? a.desde);
      pon("motivo", a.motivo);
      return guardarAusencia({}, fd);
    case "cita":
      pon("service_id", a.service_id);
      pon("resource_id", a.resource_id);
      pon("inicio", a.inicio);
      pon("cliente_nombre", a.cliente_nombre);
      pon("telefono", a.telefono);
      pon("notas", a.notas);
      pon("personas", 1);
      return crearReserva({}, fd);
    case "cancelar_cita":
      pon("id", a.id);
      return cancelarReserva({}, fd);
    case "atendida":
      pon("id", a.id);
      pon("paso", "atendida");
      return moverCita({}, fd);
    case "cobro":
      pon("booking_id", a.booking_id);
      pon("pedido_id", a.pedido_id);
      pon("monto", a.monto);
      pon("metodo", a.metodo);
      pon("concepto", a.concepto);
      pon("pendiente", "0");
      return registrarPago({}, fd);
    case "enlace_pago": {
      pon("booking_id", a.booking_id);
      pon("pedido_id", a.pedido_id);
      pon("monto", a.monto);
      pon("concepto", a.concepto);
      pon("proveedor", a.proveedor);
      pon("modo", "enlace");
      const r = await iniciarCobro({}, fd);
      return r.error ? { error: r.error } : { ok: `${r.ok} ${r.enlace ?? ""}`.trim() };
    }
    default:
      return { error: "No sé ejecutar eso todavía." };
  }
}
