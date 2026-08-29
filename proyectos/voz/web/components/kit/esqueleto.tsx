/** Esqueletos de carga: bloques en panel-2 que laten, separados por filetes. Nunca una rueda. */

function Bloque({ ancho = "100%", alto = 10, retraso = 0 }: { ancho?: string; alto?: number; retraso?: number }) {
  return (
    <span
      aria-hidden="true"
      className="kit-pulso block bg-linea"
      style={{ width: ancho, height: alto, animationDelay: `${retraso}ms` }}
    />
  );
}

export function EsqueletoLinea({ ancho, alto, retraso }: { ancho?: string; alto?: number; retraso?: number }) {
  return <Bloque ancho={ancho} alto={alto} retraso={retraso} />;
}

export function EsqueletoTabla({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  const anchos = ["46%", "22%", "18%", "14%", "20%", "30%"];
  return (
    <div role="status" aria-label="Cargando" className="border border-linea bg-panel">
      <div className="flex gap-3 border-b border-linea px-3 py-2.5">
        {Array.from({ length: columnas }).map((_, i) => (
          <Bloque key={i} ancho={anchos[i % anchos.length]} alto={8} retraso={i * 60} />
        ))}
      </div>
      <ul className="divide-y divide-linea">
        {Array.from({ length: filas }).map((_, f) => (
          <li key={f} className="flex h-9 items-center gap-3 px-3">
            {Array.from({ length: columnas }).map((_, c) => (
              <Bloque key={c} ancho={anchos[(c + f) % anchos.length]} alto={10} retraso={(f * columnas + c) * 40} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EsqueletoCifra() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2.5 bg-panel px-5 py-4">
      <Bloque ancho="40%" alto={8} />
      <Bloque ancho="55%" alto={24} retraso={120} />
      <Bloque ancho="30%" alto={8} retraso={240} />
    </div>
  );
}

export function EsqueletoTarjeta({ lineas = 3 }: { lineas?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="border border-linea bg-panel">
      <div className="border-b border-linea px-4 py-3.5">
        <Bloque ancho="38%" alto={11} />
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-4">
        {Array.from({ length: lineas }).map((_, i) => (
          <Bloque key={i} ancho={`${92 - i * 18}%`} alto={9} retraso={i * 90} />
        ))}
      </div>
    </div>
  );
}
