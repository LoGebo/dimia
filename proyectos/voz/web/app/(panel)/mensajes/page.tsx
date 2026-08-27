import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Insignia, Vacio } from "@/components/ui/primitivos";
import { mensajesSalientes, negocio } from "@/lib/consultas";
import { fechaCorta, hora, telefono as formatearTelefono } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { NOMBRE_PLANTILLA, type MensajeSaliente } from "@/lib/tipos";

function cuando(iso: string | null, zona: string): string {
  if (!iso) return "—";
  return `${fechaCorta(iso, zona)} ${hora(iso, zona)}`;
}

function Estado({ mensaje: m }: { mensaje: MensajeSaliente }) {
  if (m.estado === "enviado") return <Insignia tono="bueno">Entregado</Insignia>;
  if (m.estado === "fallido") return <Insignia tono="critico">No salió</Insignia>;
  return <Insignia tono="alerta">En cola</Insignia>;
}

export default async function Mensajes() {
  const giro = await exigirSeccion("/mensajes");
  const [lista, config] = await Promise.all([mensajesSalientes(), negocio()]);

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

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Entregados" valor={String(enviados)} glifo={Glifos.llamada} pildora="llegaron al cliente" tono="bueno" />
          <Cifra etiqueta="En cola" valor={String(enCola)} glifo={Glifos.reloj} pildora="salen en el próximo minuto" tono={enCola > 0 ? "alerta" : "neutro"} />
          <Cifra etiqueta="No salieron" valor={String(fallidos)} glifo={Glifos.alerta} pildora="se agotaron los reintentos" tono={fallidos > 0 ? "critico" : "neutro"} />
        </TiraIndicadores>

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
                      {cuando(m.enviado ?? m.creado, config.zona_horaria)}
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
