import { drenar } from "../_shared/outbox.ts";
import { autorizada, clienteServicio, json } from "../_shared/supabase.ts";

const VENTANA_HORAS = 24;
const LIMITE_POR_INVOCACION = 50;

Deno.serve(async (peticion: Request) => {
  if (!autorizada(peticion)) return json({ error: "no autorizada" }, 401);

  const supabase = clienteServicio();
  const cuerpo = await peticion.json().catch(() => ({}));
  const ventana: number = Number(cuerpo?.ventana_horas ?? VENTANA_HORAS);

  const { data, error } = await supabase.rpc("encolar_recordatorios", {
    p_ventana_horas: ventana,
  });
  if (error) return json({ error: error.message }, 500);

  try {
    const drenado = await drenar(supabase, LIMITE_POR_INVOCACION);
    return json({ ventana_horas: ventana, encolados: data ?? 0, ...drenado });
  } catch (fallo) {
    return json(
      { error: fallo instanceof Error ? fallo.message : String(fallo) },
      500,
    );
  }
});
