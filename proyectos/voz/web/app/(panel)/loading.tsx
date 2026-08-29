import { EsqueletoCifra, EsqueletoLinea, EsqueletoTabla } from "@/components/kit";

/** Esqueleto mientras el panel consulta la base: la misma caja que tendrá el contenido, latiendo. */
export default function Cargando() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="border-b border-linea bg-paper/90 px-5 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-8 w-8 border border-linea" />
          <div className="flex flex-col gap-2">
            <EsqueletoLinea ancho="180px" alto={18} />
            <EsqueletoLinea ancho="320px" alto={9} retraso={120} />
          </div>
        </div>
        <div className="mt-3 flex gap-6 border-t border-linea pt-3">
          <EsqueletoLinea ancho="96px" alto={9} retraso={60} />
          <EsqueletoLinea ancho="64px" alto={9} retraso={120} />
          <EsqueletoLinea ancho="80px" alto={9} retraso={180} />
        </div>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-1 gap-px border border-linea bg-linea sm:grid-cols-3">
          <EsqueletoCifra />
          <EsqueletoCifra />
          <EsqueletoCifra />
        </div>
        <EsqueletoTabla filas={6} columnas={4} />
      </div>
      <span className="sr-only">Cargando</span>
    </div>
  );
}
