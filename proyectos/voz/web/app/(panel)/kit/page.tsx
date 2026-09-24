import { notFound } from "next/navigation";
import { Encabezado } from "@/components/encabezado";
import { contexto } from "@/lib/sesion";
import { Muestra } from "./muestra";

export const metadata = { title: "Kit" };

/** Página de revisión del kit. Se borra cuando las piezas vivan en sus pantallas. */
export default async function Kit() {
  // Trae datos inventados: ningún dueño debe verla en producción.
  if (process.env.NODE_ENV === "production") notFound();
  const { giro } = await contexto();
  return (
    <>
      <Encabezado titulo="Kit" descripcion="Piezas de interfaz, para revisar antes de aplicarlas" giro={giro.nombre} />
      <Muestra />
    </>
  );
}
