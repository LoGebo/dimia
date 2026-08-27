import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function entorno(nombre: string, porDefecto = ""): string {
  return Deno.env.get(nombre) ?? porDefecto;
}

export function clienteServicio(): SupabaseClient {
  return createClient(
    entorno("SUPABASE_URL"),
    entorno("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

export function autorizada(peticion: Request): boolean {
  const esperado = entorno("FUNCTION_SECRET");
  if (!esperado) {
    console.error("FUNCTION_SECRET no esta definido: se rechaza la peticion");
    return false;
  }
  return igualesEnTiempoConstante(peticion.headers.get("x-function-secret") ?? "", esperado);
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const largo = Math.max(ba.length, bb.length);
  let diferencia = ba.length ^ bb.length;
  for (let i = 0; i < largo; i++) {
    diferencia |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diferencia === 0;
}

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function conReintento<T>(
  operacion: () => Promise<T>,
  intentos = 3,
  esperaMs = 250,
): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      return await operacion();
    } catch (error) {
      ultimo = error;
      await new Promise((r) => setTimeout(r, esperaMs * 2 ** i));
    }
  }
  throw ultimo;
}
