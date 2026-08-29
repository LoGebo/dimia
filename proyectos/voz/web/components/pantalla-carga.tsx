"use client";

import { useEffect, useState } from "react";
import { IconoDimia } from "@/components/marca";

const CLAVE = "panel_cargado";

/**
 * La pantalla de carga al entrar: el ícono de Dimia dentro de un anillo que
 * gira, como al iniciar la app. Se muestra una vez por sesión, al menos 700 ms,
 * y se desvanece cuando el panel ya está pintado.
 */
export function PantallaCarga() {
  const [fase, setFase] = useState<"oculta" | "visible" | "saliendo">("oculta");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAVE)) return;
      sessionStorage.setItem(CLAVE, "1");
    } catch {
      return;
    }
    setFase("visible");
    const t = setTimeout(() => setFase("saliendo"), 700);
    const fin = setTimeout(() => setFase("oculta"), 1400);
    return () => {
      clearTimeout(t);
      clearTimeout(fin);
    };
  }, []);

  if (fase === "oculta") return null;

  return (
    <div role="status" aria-label="Cargando el panel" className={`carga-panel ${fase === "saliendo" ? "se-desvanece" : ""}`}>
      <div className="carga-anillo gira">
        <span className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-panel text-tinta" style={{ animation: "gira 1.1s linear infinite reverse" }}>
          <IconoDimia tamano={34} />
        </span>
      </div>
    </div>
  );
}
