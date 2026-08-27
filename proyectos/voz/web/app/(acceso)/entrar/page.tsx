import { redirect } from "next/navigation";
import { FormularioAcceso } from "@/components/formulario-acceso";
import { modoSupabase, usuarioActual } from "@/lib/auth";

export default async function Entrar() {
  if (await usuarioActual()) redirect("/hoy");
  return <FormularioAcceso modo="entrar" supabase={modoSupabase()} />;
}
