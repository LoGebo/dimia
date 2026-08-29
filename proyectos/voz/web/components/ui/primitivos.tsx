import type { ComponentProps, ReactNode } from "react";

type Variante = "solido" | "contorno" | "fantasma" | "peligro" | "secundario";

const variantes: Record<Variante, string> = {
  solido: "bg-acento text-acento-tinta border-transparent hover:brightness-110 disabled:bg-linea disabled:text-tinta-3",
  secundario: "bg-tinta-2 text-paper border-transparent hover:bg-tinta disabled:bg-linea disabled:text-tinta-3",
  contorno: "bg-panel text-tinta border-linea hover:border-linea-fuerte hover:bg-panel-2",
  fantasma: "bg-transparent text-tinta-2 border-transparent hover:bg-panel-2 hover:text-tinta",
  peligro: "bg-transparent text-critico border-transparent hover:bg-critico/10",
};

export function Boton({
  variante = "contorno",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-[14px] font-medium transition-[background-color,border-color,color,filter] duration-100 active:scale-[0.98] focus-visible:border-acento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/25 disabled:pointer-events-none disabled:opacity-100 ${variantes[variante]} ${className}`}
    />
  );
}

/** Tarjeta blanca con filete y esquinas de 8 px: la unidad de todo el panel. */
export function Tarjeta({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`rounded-lg border border-linea bg-panel ${className}`} />;
}

export function TarjetaCabecera({
  titulo,
  descripcion,
  accion,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-linea px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-tinta">
          {icono ? <span className="text-acento">{icono}</span> : null}
          {titulo}
        </h2>
        {descripcion ? <p className="mt-0.5 text-[12.5px] leading-snug text-tinta-3">{descripcion}</p> : null}
      </div>
      {accion ? <div className="flex flex-none items-center gap-2">{accion}</div> : null}
    </div>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  children,
  className = "",
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[13px] font-semibold text-tinta">{etiqueta}</span>
      {children}
      {ayuda ? <span className="mt-1 block text-[11.5px] text-tinta-3">{ayuda}</span> : null}
    </label>
  );
}

const baseCampo =
  "w-full rounded-lg border border-linea bg-panel px-3 py-1.5 text-[13px] text-tinta outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-tinta-3 hover:border-linea-fuerte focus:border-acento focus:ring-2 focus:ring-acento/20 disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-tinta-3";

export function Entrada({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${baseCampo} h-8 ${className}`} />;
}

export function AreaTexto({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${baseCampo} resize-y ${className}`} />;
}

export function Selector({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${baseCampo} h-8 appearance-none pr-8 ${className}`} />;
}

export function Insignia({
  tono = "neutro",
  children,
}: {
  tono?: "neutro" | "bueno" | "alerta" | "critico" | "acento";
  children: ReactNode;
}) {
  const tonos = {
    neutro: "border-linea text-tinta-2 bg-panel-2",
    bueno: "border-transparent text-bueno bg-bueno/10",
    alerta: "border-transparent text-alerta bg-alerta/10",
    critico: "border-transparent text-critico bg-critico/10",
    acento: "border-transparent text-acento bg-acento-suave",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${tonos[tono]}`}>
      {children}
    </span>
  );
}

/** Estado vacío centrado, como en los tableros que aún no tienen datos. */
export function Vacio({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <p className="text-[14px] font-bold text-tinta-2">{titulo}</p>
      {detalle ? <p className="max-w-sm text-[12.5px] leading-relaxed text-tinta-3">{detalle}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "error" | "ok"; children: ReactNode }) {
  const clase = tono === "error" ? "border-critico/30 bg-critico/10 text-critico" : "border-bueno/30 bg-bueno/10 text-bueno";
  return (
    <p role={tono === "error" ? "alert" : "status"} className={`entra rounded-lg border px-3 py-2 text-[12.5px] font-medium ${clase}`}>
      {children}
    </p>
  );
}
