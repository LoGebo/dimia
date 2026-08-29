import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { mensajesSalientes, negocio } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";
import { TablaMensajes } from "./tabla";

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

        <TablaMensajes lista={lista} zona={config.zona_horaria} />
      </div>
    </>
  );
}
