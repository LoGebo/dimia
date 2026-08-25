import { Encabezado } from "@/components/encabezado";
import { RenglonConversacion } from "@/components/bandeja";
import { Vacio } from "@/components/ui/primitivos";
import { conversaciones } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

/**
 * La bandeja es lista y detalle a la vez: la lista vive en el layout para que
 * no se recargue al saltar de un hilo a otro.
 */
export default async function BandejaLayout({ children }: { children: React.ReactNode }) {
  const giro = await exigirSeccion("/bandeja");
  const hilos = await conversaciones();

  return (
    <>
      <Encabezado
        titulo="Bandeja"
        descripcion="Todo lo que le dijeron a tu agente, por teléfono y por WhatsApp."
        giro={giro.nombre}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-r border-linea lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
          {hilos.length === 0 ? (
            <Vacio
              titulo="Todavía no hay conversaciones"
              detalle="En cuanto alguien llame o escriba por WhatsApp, aparece aquí."
            />
          ) : (
            hilos.map((c) => (
              <RenglonConversacion key={c.id} conversacion={c} activa={false} />
            ))
          )}
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </>
  );
}
