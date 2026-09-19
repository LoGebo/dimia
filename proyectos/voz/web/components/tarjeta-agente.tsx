import Link from "next/link";
import { IconoAgente } from "@/components/icono-agente";

export function TarjetaAgente({ id, nombre, tarea, activo }: { id: string; nombre: string; tarea: string; activo: boolean }) {
  return (
    <Link href={`/agentes/${id}`} className="flex min-h-[168px] flex-col items-center justify-center gap-3 border border-linea bg-panel px-5 text-center transition-colors duration-150 hover:border-linea-fuerte">
      <span className="relative">
        <IconoAgente nombre={nombre} tamano={48} />
        <i aria-hidden="true" className={`absolute -right-1 -bottom-1 h-2.5 w-2.5 border-2 border-panel ${activo ? "bg-bueno" : "bg-linea-fuerte"}`} />
      </span>
      <span className="text-[14px] font-semibold text-tinta">{nombre}</span>
      <span className="line-clamp-2 text-[12px] leading-snug text-tinta-2">{tarea}</span>
    </Link>
  );
}
