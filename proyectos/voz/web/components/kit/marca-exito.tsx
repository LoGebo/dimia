/**
 * Marca de éxito: un cuadrado en verde cuyo trazo de palomita se dibuja.
 * Para confirmar un guardado o un cobro sin cambiar de pantalla.
 */
export function MarcaExito({
  texto,
  tamano = 20,
  tono = "bueno",
  className = "",
}: {
  texto?: string;
  tamano?: number;
  tono?: "bueno" | "acento";
  className?: string;
}) {
  const color = tono === "bueno" ? "text-bueno" : "text-acento";
  const fondo = tono === "bueno" ? "bg-bueno/12" : "bg-acento-suave";
  return (
    <span role="status" className={`inline-flex items-center gap-2 ${color} ${className}`}>
      <span
        className={`entra flex flex-none items-center justify-center border-2 border-current ${fondo}`}
        style={{ width: tamano, height: tamano }}
      >
        <svg viewBox="0 0 16 16" className="h-[70%] w-[70%]" fill="none" stroke="currentColor" strokeWidth="2">
          <path className="kit-traza" style={{ ["--largo" as string]: 20 }} d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      </span>
      {texto ? <span className="kit-revela text-[13px] font-medium" style={{ animationDelay: "200ms" }}>{texto}</span> : null}
    </span>
  );
}
