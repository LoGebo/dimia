const BOTON = "border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2";

/**
 * ‹ · Hoy · › : el mismo control en Agenda, Pedidos y Cobros. Enlaces de
 * documento completo y no next/link: en Next 15.5 la navegación del cliente
 * que solo cambia los searchParams se quedaba atorada (pedía el RSC y no
 * cambiaba la vista). Mismo arreglo que Chip.
 */
export function NavegarDia({ anterior, hoy, siguiente }: { anterior: string; hoy: string; siguiente: string }) {
  return (
    <div className="flex items-center gap-1">
      <a href={anterior} aria-label="Día anterior" className={`flex h-8 w-8 items-center justify-center ${BOTON}`}>
        ‹
      </a>
      <a href={hoy} className={`h-8 px-2.5 text-[12px] leading-[30px] ${BOTON}`}>
        Hoy
      </a>
      <a href={siguiente} aria-label="Día siguiente" className={`flex h-8 w-8 items-center justify-center ${BOTON}`}>
        ›
      </a>
    </div>
  );
}
