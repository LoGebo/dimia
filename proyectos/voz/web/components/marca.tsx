import { SoloAbierto } from "@/components/kit/lateral";

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

/** Cabecera de la barra lateral: la marca y el nombre del producto. Plegada, solo el ícono. */
export function MarcaDimia() {
  return (
    <div className="flex h-[52px] items-center gap-2.5 border-b border-linea px-3 text-tinta in-[[data-plegado]]:justify-center in-[[data-plegado]]:px-0">
      <IconoDimia />
      <SoloAbierto>
        <div className="min-w-0 leading-tight">
          <p className="text-[14px] font-semibold tracking-tight">Dimia Línea</p>
          <p className="etiqueta mt-0.5 whitespace-nowrap">Panel de operación</p>
        </div>
      </SoloAbierto>
    </div>
  );
}
