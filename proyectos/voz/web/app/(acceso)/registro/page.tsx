import { redirect } from "next/navigation";
import { FormularioAcceso } from "@/components/formulario-acceso";
import { modoSupabase, usuarioActual } from "@/lib/auth";
import { plantillasPublicas } from "@/lib/plantillas";

export default async function Registro() {
  if (await usuarioActual()) redirect("/hoy");
  const plantillas = await plantillasPublicas();
  return <FormularioAcceso modo="registro" supabase={modoSupabase()} plantillas={plantillas} />;
}
