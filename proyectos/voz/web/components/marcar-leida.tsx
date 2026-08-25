"use client";

import { useEffect } from "react";
import { marcarLeida } from "@/lib/acciones";

/**
 * Marca el hilo como leído al abrirlo.
 *
 * Va en un efecto del cliente, no en el render del servidor: revalidar durante
 * el render está prohibido en Next, y sin revalidar el contador del menú se
 * quedaría con el número viejo hasta la siguiente navegación.
 */
export function MarcarLeida({ conversacionId }: { conversacionId: string }) {
  useEffect(() => {
    void marcarLeida(conversacionId);
  }, [conversacionId]);
  return null;
}
