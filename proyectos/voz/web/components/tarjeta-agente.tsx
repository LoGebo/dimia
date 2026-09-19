import Link from "next/link";
import { IconoAgente } from "@/components/icono-agente";

export function TarjetaAgente({ id, nombre, tarea, activo }: { id: string; nombre: string; tarea: string; activo: boolean }) {
  return (
    <Link href={`/agentes/${id}`} className="flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl border border-linea bg-panel px-5 text-center transition-[border-color,transform] duration-150 hover:border-linea-fuerte hover:-translate-y-0.5">
      <span className="relative">
        <IconoAgente nombre={nombre} trabajo={tarea} tamano={56} />
        <i aria-hidden="true" className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-panel ${activo ? "bg-bueno" : "bg-linea-fuerte"}`} />
      </span>
      <span className="text-[14px] font-semibold text-tinta">{nombre}</span>
      <span className="line-clamp-2 text-[12px] leading-snug text-tinta-2">{tarea}</span>
    </Link>
  );
}
