"use client";

import { BotonPlegar, useBarra } from "@/components/barra-lateral";
/** El ícono de Dimia: las dos i recortadas del logotipo. */
export function IconoDimia({ tamano = 22 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 100 100" role="img" aria-label="Dimia">
      <rect x="25" y="42" width="17" height="44" fill="currentColor" />
      <rect x="25" y="16" width="17" height="17" fill="#6e9bf5" />
      <rect x="58" y="42" width="17" height="44" fill="currentColor" />
      <rect x="58" y="16" width="17" height="17" fill="currentColor" />
    </svg>
  );
}

/** Cabecera del menú: el ícono y el nombre; plegada, solo el ícono y el botón debajo. */
export function MarcaDimia() {
  const { colapsada } = useBarra();
  return (
    <div className={`flex flex-col border-b border-linea text-tinta ${colapsada ? "items-center gap-1 px-2 pt-3 pb-2" : "h-[70px] flex-row items-center gap-3 px-4"}`}>
      <span className="flex h-9 w-9 flex-none items-center justify-center"><IconoDimia tamano={colapsada ? 28 : 32} /></span>
      <p className={`min-w-0 flex-1 truncate text-[20px] font-extrabold tracking-tight transition-opacity duration-150 ${colapsada ? "hidden" : ""}`}>
        Dimia <span className="font-medium text-tinta-2">Panel</span>
      </p>
      <BotonPlegar />
    </div>
  );
}
