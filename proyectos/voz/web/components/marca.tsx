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

/** Cabecera del menú: el ícono y el nombre del producto, a la altura de la barra. */
export function MarcaDimia() {
  return (
    <div className="flex h-[70px] items-center gap-2.5 border-b border-linea px-5 text-tinta">
      <IconoDimia tamano={22} />
      <p className="text-[16px] font-extrabold tracking-tight">
        Dimia <span className="font-medium text-tinta-2">Línea</span>
      </p>
    </div>
  );
}
