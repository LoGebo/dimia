import { redirect } from "next/navigation";
import { FormularioAcceso } from "@/components/formulario-acceso";
import { modoSupabase, usuarioActual } from "@/lib/auth";

export default async function Registro() {
  if (await usuarioActual()) redirect("/resumen");
  return <FormularioAcceso modo="registro" supabase={modoSupabase()} />;
}
