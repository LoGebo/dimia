import { drenar } from "../_shared/outbox.ts";
import { autorizada, clienteServicio, json } from "../_shared/supabase.ts";

const LIMITE_POR_INVOCACION = 25;

Deno.serve(async (peticion: Request) => {
  if (!autorizada(peticion)) return json({ error: "no autorizada" }, 401);

  const supabase = clienteServicio();
  const cuerpo = await peticion.json().catch(() => ({}));
  const bookingId: string | undefined = cuerpo?.booking_id;

  if (bookingId) {
    const { error } = await supabase.rpc("encolar_mensaje", {
      p_booking: bookingId,
      p_plantilla: cuerpo?.plantilla ?? "confirmacion",
    });
    if (error) return json({ error: error.message }, 400);
  }

  try {
    return json(await drenar(supabase, LIMITE_POR_INVOCACION));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
