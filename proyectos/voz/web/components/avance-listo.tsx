import Link from "next/link";
import type { Avance } from "@/lib/listo";

/**
 * Barra fija arriba del panel: qué falta para que la línea conteste.
 * Desaparece cuando el negocio ya está completo y con número asignado:
 * a partir de ahí solo estorba.
 */
export function AvanceListo({ avance }: { avance: Avance }) {
  if (avance.completo && avance.tieneNumero) return null;

  const faltantes = avance.requisitos.filter((r) => !r.listo);

  return (
    <section
      aria-label="Avance de configuración"
      className="border-b border-linea bg-panel px-6 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span className="etiqueta">Listo para contestar</span>
          <span className="text-[13px] text-tinta numeros">
            {avance.cumplidos}/{avance.total}
          </span>
        </div>

        <div
          className="h-[3px] min-w-[120px] flex-1 bg-linea"
          role="progressbar"
          aria-valuenow={avance.porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-acento transition-[width] duration-500"
            style={{ width: `${avance.porcentaje}%` }}
          />
        </div>

        {avance.completo ? (
          <Link href="/agente" className="text-[13px] font-medium text-bueno transition hover:opacity-80">
            Todo listo · falta asignar el número
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-tinta-3">Falta</span>
            {faltantes.slice(0, 3).map((r) => (
              <Link
                key={r.clave}
                href={r.ruta}
                title={r.ayuda}
                className="border border-linea px-2.5 py-1 text-[12px] text-tinta-2 transition hover:border-acento hover:text-acento"
              >
                {r.nombre}
              </Link>
            ))}
            {faltantes.length > 3 ? (
              <span className="text-[12px] text-tinta-3">y {faltantes.length - 3} más</span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
