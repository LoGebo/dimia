import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { conSesion, type Consulta } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import type { Membresia } from "@/lib/tipos";

const COOKIE_NEGOCIO = "agenda_negocio";

export type Contexto = {
  usuario: { id: string; email: string };
  negocioId: string;
  rol: Membresia["rol"];
  membresias: Membresia[];
};

export async function membresias(userId: string): Promise<Membresia[]> {
  return conSesion(userId, (q) =>
    q<Membresia>(
      `select m.tenant_id, m.rol, t.nombre, t.vertical
         from tenant_member m join tenant t on t.id = m.tenant_id
        where m.user_id = $1
        order by t.nombre, t.id`,
      [userId],
    ),
  );
}

export async function contexto(): Promise<Contexto> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const lista = await membresias(usuario.id);
  if (lista.length === 0) redirect("/alta");
  const almacen = await cookies();
  const elegido = almacen.get(COOKIE_NEGOCIO)?.value;
  const activo = lista.find((m) => m.tenant_id === elegido) ?? lista[0]!;
  return { usuario, negocioId: activo.tenant_id, rol: activo.rol, membresias: lista };
}

export async function datos<T>(fn: (q: Consulta, negocioId: string) => Promise<T>): Promise<T> {
  const { usuario, negocioId } = await contexto();
  return conSesion(usuario.id, (q) => fn(q, negocioId));
}

export async function elegirNegocio(negocioId: string): Promise<void> {
  const almacen = await cookies();
  almacen.set(COOKIE_NEGOCIO, negocioId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
