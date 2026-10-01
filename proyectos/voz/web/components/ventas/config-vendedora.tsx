"use client";

import { useEffect, useState } from "react";
import { ExperimentoSeguimiento } from "@/components/ventas/experimento";
import { Seguimiento } from "@/components/ventas/seguimiento";
import { configVendedora } from "@/lib/acciones-ventas";

/** Cómo da seguimiento la Vendedora, dentro de su engrane: lo mismo que se le puede pedir en el chat. */
export function ConfigVendedora() {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof configVendedora>> | null>(null);
  useEffect(() => { configVendedora().then(setDatos).catch(() => {}); }, []);
  if (!datos) return <p className="late text-[13px] text-tinta-3">Cargando su configuración…</p>;
  const { config, niveles, experimento } = datos;
  const base = config.nivel === "propio" && config.pasos ? config.pasos : niveles[config.nivel]?.[config.trato] ?? [];
  return (
    <div className="-mx-5 space-y-2">
      <p className="px-5 text-[13px] font-medium text-tinta-2">Seguimiento a interesados</p>
      <Seguimiento key={JSON.stringify(config)} inicial={config} niveles={niveles} />
      <div className="px-5"><ExperimentoSeguimiento experimento={experimento} base={base} /></div>
    </div>
  );
}
