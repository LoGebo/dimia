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

/** Cabecera de la barra lateral: la marca y el nombre del producto. */
export function MarcaDimia() {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-3 text-tinta">
      <IconoDimia />
      <div className="min-w-0 leading-tight">
        <p className="text-[14px] font-semibold tracking-tight">Dimia Línea</p>
        <p className="etiqueta mt-0.5">Panel de operación</p>
      </div>
    </div>
  );
}
