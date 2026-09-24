import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { conSesion, type Consulta } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { HERRAMIENTAS_POR_DEFECTO, permiteSeccion, rutasPanel } from "@/lib/giro";
import type { Herramienta, Membresia } from "@/lib/tipos";

const COOKIE_NEGOCIO = "agenda_negocio";

export type Giro = { clave: string; nombre: string; herramientas: Herramienta[] };

export type Contexto = {
  usuario: { id: string; email: string };
  negocioId: string;
  rol: Membresia["rol"];
  giro: Giro;
  membresias: Membresia[];
};

/** Se resuelve una vez por petición: cada tarjeta del panel lo pide y antes abría su propia transacción. */
export const membresias = cache(async (userId: string): Promise<Membresia[]> => {
  return conSesion(userId, (q) =>
    q<Membresia>(
      `select m.tenant_id, m.rol, t.nombre, t.vertical,
              coalesce(v.nombre, t.vertical) as vertical_nombre,
              coalesce(v.herramientas, $2::jsonb) as herramientas
         from tenant_member m
         join tenant t on t.id = m.tenant_id
         left join vertical_template v on v.clave = t.vertical
        where m.user_id = $1
        order by t.nombre, t.id`,
      [userId, JSON.stringify(HERRAMIENTAS_POR_DEFECTO)],
    ),
  );
});

function giroDe(membresia: Membresia): Giro {
  return {
    clave: membresia.vertical,
    nombre: membresia.vertical_nombre,
    herramientas: membresia.herramientas,
  };
}

async function activa(lista: Membresia[]): Promise<Membresia> {
  const almacen = await cookies();
  const elegido = almacen.get(COOKIE_NEGOCIO)?.value;
  return lista.find((m) => m.tenant_id === elegido) ?? lista[0]!;
}

export const contexto = cache(async (): Promise<Contexto> => {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const lista = await membresias(usuario.id);
  if (lista.length === 0) redirect("/alta");
  const actual = await activa(lista);
  return {
    usuario,
    negocioId: actual.tenant_id,
    rol: actual.rol,
    giro: giroDe(actual),
    membresias: lista,
  };
});

export async function giroOpcional(): Promise<Giro | null> {
  const usuario = await usuarioActual();
  if (!usuario) return null;
  const lista = await membresias(usuario.id);
  if (lista.length === 0) return null;
  return giroDe(await activa(lista));
}

export async function exigirSeccion(href: string): Promise<Giro> {
  const { giro } = await contexto();
  if (!permiteSeccion(giro.herramientas, href)) redirect("/hoy");
  return giro;
}

/**
 * La misma revisión que exigirSeccion, pero desde el layout del panel con la
 * ruta que deja el middleware. El layout corre antes de que loading.tsx abra
 * el streaming, así que el redirect sale como un 307 real. Las páginas siguen
 * llamando exigirSeccion para la navegación dentro del panel.
 */
export async function exigirSeccionDeRuta(): Promise<void> {
  const ruta = (await headers()).get("x-ruta");
  if (!ruta) return;
  const seccion = `/${ruta.split("/")[1] ?? ""}`;
  if (rutasPanel(["agendar", "pedido", "recado"]).includes(seccion)) await exigirSeccion(seccion);
}

export async function datos<T>(fn: (q: Consulta, negocioId: string) => Promise<T>): Promise<T> {
  const { usuario, negocioId } = await contexto();
  return conSesion(usuario.id, (q) => fn(q, negocioId));
}

export async function elegirNegocio(negocioId: string): Promise<void> {
  const almacen = await cookies();
  almacen.set(COOKIE_NEGOCIO, negocioId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
