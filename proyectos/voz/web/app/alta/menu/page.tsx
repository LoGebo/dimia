import { redirect } from "next/navigation";

/** El alta dejó de ser un asistente aparte: se configura en el panel. */
export default function AltaVieja() {
  redirect("/catalogo");
}
