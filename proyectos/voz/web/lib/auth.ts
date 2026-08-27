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

function verificar(token: string): string | null {
  const [valor, firma] = token.split(".");
  if (!valor || !firma) return null;
  const esperada = Buffer.from(firmar(valor));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return null;
  return timingSafeEqual(esperada, recibida) ? valor : null;
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
  const id = token ? verificar(token) : null;
  if (!id) return null;
  const filas = await elevado((q) =>
    q<{ email: string }>("select email from usuario_panel where id = $1", [id]),
  );
  const fila = filas[0];
  return fila ? { id, email: fila.email } : null;
});

export async function iniciarSesionLocal(email: string, password: string): Promise<string | null> {
  const filas = await elevado((q) =>
    q<{ id: string }>(
      "select id from usuario_panel where email = lower(trim($1)) and password_hash = crypt($2, password_hash)",
      [email, password],
    ),
  );
  const fila = filas[0];
  if (!fila) return null;
  await escribirCookie(fila.id);
  return fila.id;
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
  await escribirCookie(id);
  return id;
}

export async function cerrarSesion(): Promise<void> {
  const almacen = await cookies();
  if (modoSupabase()) await clienteSupabase(almacen).auth.signOut();
  almacen.delete(COOKIE_SESION);
}

async function escribirCookie(id: string): Promise<void> {
  const almacen = await cookies();
  almacen.set(COOKIE_SESION, `${id}.${firmar(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
}
