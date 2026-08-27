import Link from "next/link";

const BOTON = "border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2";

/** ‹ · Hoy · › : el mismo control en Agenda, Pedidos y Cobros. */
export function NavegarDia({ anterior, hoy, siguiente }: { anterior: string; hoy: string; siguiente: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={anterior} aria-label="Día anterior" className={`flex h-8 w-8 items-center justify-center ${BOTON}`}>
        ‹
      </Link>
      <Link href={hoy} className={`h-8 px-2.5 text-[12px] leading-[30px] ${BOTON}`}>
        Hoy
      </Link>
      <Link href={siguiente} aria-label="Día siguiente" className={`flex h-8 w-8 items-center justify-center ${BOTON}`}>
        ›
      </Link>
    </div>
  );
}
