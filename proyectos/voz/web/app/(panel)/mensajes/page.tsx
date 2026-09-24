import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { conteoMensajes, mensajesSalientes, negocio } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";
import { TablaMensajes } from "./tabla";

export default async function Mensajes() {
  const giro = await exigirSeccion("/mensajes");
  const [lista, conteo, config] = await Promise.all([mensajesSalientes(), conteoMensajes(), negocio()]);

  // Las cifras cuentan todo; la tabla solo trae los más recientes.
  const enviados = conteo.enviado ?? 0;
  const enCola = conteo.pendiente ?? 0;
  const fallidos = conteo.fallido ?? 0;
  const total = Object.values(conteo).reduce((s, n) => s + n, 0);

  return (
    <>
      <Encabezado
        titulo="Avisos"
        descripcion="Confirmaciones, recordatorios y avisos que el agente manda solo por WhatsApp. Aquí ve si salieron."
        giro={giro.nombre}
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Entregados" valor={String(enviados)} glifo={Glifos.llamada} pildora="llegaron al cliente" tono="bueno" />
          <Cifra etiqueta="En cola" valor={String(enCola)} glifo={Glifos.reloj} pildora="salen en el próximo minuto" tono={enCola > 0 ? "alerta" : "neutro"} />
          <Cifra etiqueta="No salieron" valor={String(fallidos)} glifo={Glifos.alerta} pildora="se agotaron los reintentos" tono={fallidos > 0 ? "critico" : "neutro"} />
        </TiraIndicadores>

        <TablaMensajes lista={lista} zona={config.zona_horaria} />
        {total > lista.length ? (
          <p className="numeros text-[12px] text-tinta-3">
            Se muestran los {lista.length} más recientes de {total}.
          </p>
        ) : null}
      </div>
    </>
  );
}
