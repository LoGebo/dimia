import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Outbox, ResultadoDrenado } from "./tipos.ts";
import { enviarTexto, redactar } from "./whatsapp.ts";

export async function reclamar(
  supabase: SupabaseClient,
  limite: number,
): Promise<Outbox[]> {
  const { data, error } = await supabase.rpc("outbox_reclamar", {
    p_limite: limite,
  });
  if (error) throw new Error(`outbox_reclamar: ${error.message}`);
  return (data ?? []) as Outbox[];
}

export async function drenar(
  supabase: SupabaseClient,
  limite = 25,
): Promise<ResultadoDrenado> {
  const pendientes = await reclamar(supabase, limite);
  let enviados = 0;
  let fallidos = 0;

  await Promise.all(
    pendientes.map(async (fila) => {
      try {
        if (fila.canal !== "whatsapp") {
          throw new Error(`canal no soportado: ${fila.canal}`);
        }
        await enviarTexto(fila.destino, redactar(fila.plantilla, fila.payload));
        await supabase.rpc("outbox_marcar_enviado", { p_id: fila.id });
        enviados++;
      } catch (error) {
        fallidos++;
        await supabase.rpc("outbox_marcar_error", {
          p_id: fila.id,
          p_error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return { reclamados: pendientes.length, enviados, fallidos };
}
