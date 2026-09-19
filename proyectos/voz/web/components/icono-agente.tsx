/**
 * El ícono de un agente: un cuadrado de tinta con su inicial y un punto de
 * acento, como el logotipo. Recepción lleva el ícono de Dimia.
 */
export function IconoAgente({ nombre, tamano = 40 }: { nombre: string; tamano?: number }) {
  const inicial = (nombre.trim().charAt(0) || "A").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="relative flex flex-none items-center justify-center bg-tinta font-semibold text-paper"
      style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.42) }}
    >
      {inicial}
      <i className="absolute bg-acento" style={{ width: Math.max(4, tamano / 8), height: Math.max(4, tamano / 8), right: tamano / 8, bottom: tamano / 8 }} />
    </span>
  );
}
