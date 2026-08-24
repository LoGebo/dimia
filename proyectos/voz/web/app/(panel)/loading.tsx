/** Esqueleto mientras el panel consulta la base: filetes, no ruedas girando. */
export default function Cargando() {
  return (
    <div className="animate-pulse px-6 py-6" aria-busy="true" aria-live="polite">
      <div className="h-5 w-48 bg-panel-2" />
      <div className="mt-3 h-3 w-72 bg-panel-2" />
      <div className="mt-8 space-y-px border border-linea bg-linea">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-panel" />
        ))}
      </div>
      <span className="sr-only">Cargando</span>
    </div>
  );
}
