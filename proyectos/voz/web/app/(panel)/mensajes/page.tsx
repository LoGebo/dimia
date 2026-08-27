import { Encabezado, Indicador } from "@/components/encabezado";
import { Insignia, Vacio } from "@/components/ui/primitivos";
import { mensajesSalientes } from "@/lib/consultas";
import { telefono as formatearTelefono } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { NOMBRE_PLANTILLA, type MensajeSaliente } from "@/lib/tipos";

function cuando(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Estado({ mensaje: m }: { mensaje: MensajeSaliente }) {
  if (m.estado === "enviado") return <Insignia tono="bueno">Entregado</Insignia>;
  if (m.estado === "fallido") return <Insignia tono="critico">No salió</Insignia>;
  return <Insignia tono="alerta">En cola</Insignia>;
}

export default async function Mensajes() {
  const giro = await exigirSeccion("/mensajes");
  const lista = await mensajesSalientes();

  const enviados = lista.filter((m) => m.estado === "enviado").length;
  const enCola = lista.filter((m) => m.estado === "pendiente").length;
  const fallidos = lista.filter((m) => m.estado === "fallido").length;

  return (
    <>
      <Encabezado
        titulo="Avisos"
        descripcion="Confirmaciones, recordatorios y avisos que el agente manda solo por WhatsApp. Aquí ves si salieron."
        giro={giro.nombre}
      />

      <div className="grid grid-cols-2 gap-px bg-linea lg:grid-cols-3">
        <Indicador etiqueta="Entregados" valor={String(enviados)} detalle="llegaron al cliente" />
        <Indicador
          etiqueta="En cola"
          valor={String(enCola)}
          detalle="salen en el próximo minuto"
          tono={enCola > 0 ? "alerta" : undefined}
        />
        <Indicador
          etiqueta="No salieron"
          valor={String(fallidos)}
          detalle="se agotaron los reintentos"
          tono={fallidos > 0 ? "critico" : undefined}
        />
      </div>

      <div className="px-5 py-5">
        {lista.length === 0 ? (
          <Vacio
            titulo="Todavía no sale ningún mensaje"
            detalle="En cuanto el agente cierre un pedido o aparte una cita, la confirmación se manda sola y aparece aquí."
          />
        ) : (
          <div className="overflow-x-auto border border-linea">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-linea bg-panel text-left">
                  <th className="px-4 py-2.5 font-medium text-tinta-2">Para</th>
                  <th className="px-4 py-2.5 font-medium text-tinta-2">Qué se mandó</th>
                  <th className="px-4 py-2.5 font-medium text-tinta-2">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-tinta-2">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="border-b border-linea last:border-0">
                    <td className="numeros px-4 py-2.5 text-tinta">
                      {m.destino.startsWith("+") ? formatearTelefono(m.destino) : m.destino}
                    </td>
                    <td className="px-4 py-2.5 text-tinta-2">
                      {NOMBRE_PLANTILLA[m.plantilla] ?? m.plantilla}
                    </td>
                    <td className="px-4 py-2.5">
                      <Estado mensaje={m} />
                      {/* El motivo exacto, para que no haya que adivinar. */}
                      {m.ultimo_error ? (
                        <p className="mt-1 max-w-[320px] text-[11px] text-tinta-3">
                          {m.ultimo_error}
                        </p>
                      ) : null}
                      {m.estado === "pendiente" && m.intentos > 0 ? (
                        <p className="mt-1 text-[11px] text-tinta-3">
                          intento {m.intentos} de {m.max_intentos}
                        </p>
                      ) : null}
                    </td>
                    <td className="numeros px-4 py-2.5 text-tinta-3">
                      {cuando(m.enviado ?? m.creado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
