import { Encabezado } from "@/components/encabezado";
import { ListaConversaciones } from "@/components/lista-conversaciones";
import { Vacio } from "@/components/ui/primitivos";
import { conversaciones, negocio } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

/**
 * La bandeja es lista y detalle a la vez: la lista vive en el layout para que
 * no se recargue al saltar de un hilo a otro.
 */
export default async function BandejaLayout({ children }: { children: React.ReactNode }) {
  const giro = await exigirSeccion("/bandeja");
  const [hilos, config] = await Promise.all([conversaciones(), negocio()]);

  return (
    <>
      <Encabezado
        titulo="Mensajes"
        descripcion="Todo lo que entró por WhatsApp, Instagram y teléfono. Si alguien pidió una persona, está marcado."
        giro={giro.nombre}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-r border-linea lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:overflow-y-auto">
          {hilos.length === 0 ? (
            <Vacio
              titulo="Todavía no hay conversaciones"
              detalle="En cuanto alguien llame o escriba, aparece aquí."
            />
          ) : (
            <ListaConversaciones hilos={hilos} zona={config.zona_horaria} />
          )}
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </>
  );
}
