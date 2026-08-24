import type { ComponentProps, ReactNode } from "react";

type Variante = "solido" | "contorno" | "fantasma" | "peligro";

const variantes: Record<Variante, string> = {
  solido: "bg-acento text-acento-tinta hover:brightness-110 border-transparent",
  contorno: "bg-panel text-tinta border-linea-fuerte hover:bg-panel-2",
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
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-50 ${variantes[variante]} ${className}`}
    />
  );
}

export function Tarjeta({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`rounded-lg border border-linea bg-panel shadow-[var(--sombra)] ${className}`}
    />
  );
}

export function TarjetaCabecera({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-linea px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-tight text-tinta">{titulo}</h2>
        {descripcion ? <p className="mt-0.5 text-xs text-tinta-3">{descripcion}</p> : null}
      </div>
      {accion}
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
      <span className="mb-1.5 block text-xs font-medium text-tinta-2">{etiqueta}</span>
      {children}
      {ayuda ? <span className="mt-1 block text-[11px] text-tinta-3">{ayuda}</span> : null}
    </label>
  );
}

const baseCampo =
  "w-full rounded-md border border-linea bg-panel-2 px-2.5 py-1.5 text-[13px] text-tinta outline-none transition placeholder:text-tinta-3 focus:border-acento focus:bg-panel focus:ring-2 focus:ring-acento/20 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-tinta-3 disabled:placeholder:text-tinta-3/50";

export function Entrada({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${baseCampo} ${className}`} />;
}

export function AreaTexto({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${baseCampo} resize-y ${className}`} />;
}

export function Selector({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${baseCampo} appearance-none pr-8 ${className}`} />;
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
    bueno: "border-bueno/30 text-bueno bg-bueno/10",
    alerta: "border-alerta/30 text-alerta bg-alerta/10",
    critico: "border-critico/30 text-critico bg-critico/10",
    acento: "border-acento/30 text-acento bg-acento-suave",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}

export function Vacio({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-[13px] font-medium text-tinta-2">{titulo}</p>
      {detalle ? <p className="max-w-sm text-xs text-tinta-3">{detalle}</p> : null}
      {accion}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "error" | "ok"; children: ReactNode }) {
  const clase =
    tono === "error"
      ? "border-critico/30 bg-critico/10 text-critico"
      : "border-bueno/30 bg-bueno/10 text-bueno";
  return <p className={`rounded-md border px-2.5 py-1.5 text-xs ${clase}`}>{children}</p>;
}
