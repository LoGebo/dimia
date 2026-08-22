"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/primitivos";

export function Copiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Boton
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1600);
      }}
    >
      {copiado ? "Copiado" : "Copiar"}
    </Boton>
  );
}
