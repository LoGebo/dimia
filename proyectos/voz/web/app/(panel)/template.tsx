/** Cada navegación entra con un desvanecido corto hacia arriba. */
export default function PlantillaPanel({ children }: { children: React.ReactNode }) {
  return <div className="pagina-entra flex min-w-0 flex-1 flex-col">{children}</div>;
}
