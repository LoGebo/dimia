import { elevado } from "@/lib/db";
import type { PlantillaVertical } from "@/lib/tipos";

export function plantillasPublicas(): Promise<PlantillaVertical[]> {
  return elevado((q) =>
    q<PlantillaVertical>(
      "select clave, nombre, saludo, instrucciones, herramientas from vertical_template where activo and not propio order by nombre",
    ),
  );
}
