import "server-only";

import { cache } from "react";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { elevado } from "@/lib/db";

const COOKIE_SESION = "agenda_sesion";

/**
 * Firma de la cookie de sesión en modo local. Sin secreto propio cualquiera
 * podría fabricar una sesión válida, así que en producción se exige.
 */
function secretoDeSesion(): string {
  const propio = process.env.SESION_SECRETO;
  if (propio && propio.length >= 16) return propio;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta SESION_SECRETO (32 bytes aleatorios). Sin él, la sesión del panel se puede falsificar.",
    );
  }
  return "desarrollo-local-inseguro";
}

export function modoSupabase(): boolean {
  return (
    process.env.AUTH_MODE === "supabase" ||
    (!!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.AUTH_MODE !== "local")
  );
}

function firmar(valor: string): string {
  return createHmac("sha256", secretoDeSesion()).update(valor).digest("base64url");
}

const DURACION_SESION = 60 * 60 * 24 * 30;

/**
 * La cookie es `id.version.caduca.firma`. La caducidad la revisa el servidor
 * (no solo el navegador) y la versión se compara con usuario_panel: al salir
 * se sube y toda cookie anterior deja de servir.
 */
function verificar(token: string): { id: string; version: number } | null {
  const partes = token.split(".");
  if (partes.length !== 4) return null;
  const [id, version, caduca, firma] = partes as [string, string, string, string];
  const esperada = Buffer.from(firmar(`${id}.${version}.${caduca}`));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  if (!(Number(caduca) > Date.now() / 1000)) return null;
  return { id, version: Number(version) };
}

function clienteSupabase(almacen: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          for (const { name, value, options } of lista) {
            try {
              almacen.set(name, value, options);
            } catch {
              return;
            }
          }
        },
      },
    },
  );
}

export const usuarioActual = cache(async (): Promise<{ id: string; email: string } | null> => {
  const almacen = await cookies();
  if (modoSupabase()) {
    const { data } = await clienteSupabase(almacen).auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  }
  const token = almacen.get(COOKIE_SESION)?.value;
  const sesion = token ? verificar(token) : null;
  if (!sesion) return null;
  const filas = await elevado((q) =>
    q<{ email: string }>("select email from usuario_panel where id = $1 and sesion_version = $2", [sesion.id, sesion.version]),
  );
  const fila = filas[0];
  return fila ? { id: sesion.id, email: fila.email } : null;
});

/** null si no entra; "bloqueado" si ese correo agotó sus intentos en 15 minutos. */
export async function iniciarSesionLocal(email: string, password: string): Promise<string | null | "bloqueado"> {
  return elevado(async (q) => {
    const [freno] = await q<{ bloqueado: boolean }>("select acceso_bloqueado($1) as bloqueado", [email]);
    if (freno?.bloqueado) return "bloqueado";
    const filas = await q<{ id: string; sesion_version: number }>(
      "select id, sesion_version from usuario_panel where email = lower(trim($1)) and password_hash = crypt($2, password_hash)",
      [email, password],
    );
    const fila = filas[0];
    if (!fila) {
      await q("select acceso_fallido($1)", [email]);
      return null;
    }
    await q("select acceso_logrado($1)", [email]);
    await escribirCookie(fila.id, fila.sesion_version);
    return fila.id;
  });
}

export async function registrarLocal(email: string, password: string): Promise<string> {
  const id = randomUUID();
  await elevado(async (q) => {
    await q("insert into auth.users (id) values ($1)", [id]);
    await q(
      "insert into usuario_panel (id, email, password_hash) values ($1, lower(trim($2)), crypt($3, gen_salt('bf')))",
      [id, email, password],
    );
  });
  await escribirCookie(id, 0);
  return id;
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  if (modoSupabase()) await clienteSupabase(almacen).auth.signOut();
  const token = almacen.get(COOKIE_SESION)?.value;
  const sesion = token ? verificar(token) : null;
  // Borrarla del navegador no basta: una copia seguiría sirviendo.
  if (sesion) {
    await elevado((q) =>
      q("update usuario_panel set sesion_version = sesion_version + 1 where id = $1 and sesion_version = $2", [sesion.id, sesion.version]),
    );
  }
  almacen.delete(COOKIE_SESION);
}

async function escribirCookie(id: string, version: number): Promise<void> {
  const almacen = await cookies();
  const valor = `${id}.${version}.${Math.floor(Date.now() / 1000) + DURACION_SESION}`;
  almacen.set(COOKIE_SESION, `${valor}.${firmar(valor)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION,
    secure: process.env.NODE_ENV === "production",
  });
}
