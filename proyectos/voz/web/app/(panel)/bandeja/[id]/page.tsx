import { notFound } from "next/navigation";
import { Hilo } from "@/components/hilo";
import { MarcarLeida } from "@/components/marcar-leida";
import { conversacion, mensajes, negocio } from "@/lib/consultas";

export default async function HiloConversacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [hilo, config] = await Promise.all([conversacion(id), negocio()]);
  if (!hilo) notFound();

  const turnos = await mensajes(id);

  return (
    <>
      {/* Abrirla es haberla leído; se marca desde el cliente, ver el componente. */}
      <MarcarLeida conversacionId={id} />
      <Hilo conversacion={hilo} mensajes={turnos} zona={config.zona_horaria} />
    </>
  );
}
