import type { ReactNode } from "react";

export function Encabezado({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-end justify-between gap-3 border-b border-linea bg-paper/85 px-6 py-4 backdrop-blur">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-tinta">{titulo}</h1>
        {descripcion ? <p className="mt-0.5 text-[13px] text-tinta-2">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "bueno" | "alerta" | "critico";
}) {
  const color = tono ? { bueno: "text-bueno", alerta: "text-alerta", critico: "text-critico" }[tono] : "text-tinta";
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="etiqueta">{etiqueta}</p>
      <p className={`numeros mt-1.5 text-[26px] leading-none font-semibold tracking-tight ${color}`}>{valor}</p>
      {detalle ? <p className="mt-1.5 text-[11px] text-tinta-3">{detalle}</p> : null}
    </div>
  );
}
