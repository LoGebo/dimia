import { redirect } from "next/navigation";

/** Sin agente elegido se abre Recepción, que siempre está. */
export default function AgentesPage() {
  redirect("/agentes/recepcion");
}
