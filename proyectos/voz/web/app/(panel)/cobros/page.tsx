import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { TablaPagos } from "@/components/kit/relacion-cobros";
import { NavegarDia } from "@/components/navegar-dia";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { negocio, pagosDelDia, pagosPendientes, resumenCobros } from "@/lib/consultas";
import { diaValido, fechaLarga, isoDia, moneda, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { NOMBRE_METODO, type MetodoPago } from "@/lib/tipos";

export default async function Cobros({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const giro = await exigirSeccion("/cobros");
  const parametros = await searchParams;
  const config = await negocio();
  const hoy = isoDia(new Date(), config.zona_horaria);
  const dia = diaValido(parametros.dia, hoy);
  const [pagos, pendientes, resumen] = await Promise.all([pagosDelDia(dia), pagosPendientes(), resumenCobros(dia)]);

  return (
    <>
      <Encabezado
        titulo="Cobros"
        descripcion={fechaLarga(`${dia}T12:00:00Z`, "UTC")}
        giro={giro.nombre}
        acciones={<NavegarDia anterior={`/cobros?dia=${sumarDias(dia, -1)}`} hoy={`/cobros?dia=${hoy}`} siguiente={`/cobros?dia=${sumarDias(dia, 1)}`} />}
      />
      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Cobrado el día" valor={moneda(resumen.cobrado)} glifo={Glifos.dinero} pildora={`${resumen.operaciones} cobros`} tono="bueno" />
          {resumen.por_metodo.slice(0, 2).map((m) => (
            <Cifra key={m.metodo} etiqueta={NOMBRE_METODO[m.metodo as MetodoPago] ?? m.metodo} valor={moneda(m.monto)} glifo={Glifos.dinero} />
          ))}
          <Cifra
            etiqueta="Pendiente de cobrar"
            valor={moneda(resumen.pendiente)}
            glifo={Glifos.alerta}
            tono={Number(resumen.pendiente) > 0 ? "alerta" : "bueno"}
            pildora={`${pendientes.length} por cobrar`}
          />
        </TiraIndicadores>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Tarjeta>
            <TarjetaCabecera titulo="Cobros del día" descripcion="Cada cita o pedido que se cobró, con su método." />
            <TablaPagos
              pagos={pagos}
              zona={config.zona_horaria}
              vacio={{ titulo: "Sin cobros este día", detalle: "Se registran desde la agenda al marcar una cita como atendida, o desde pedidos al entregar." }}
            />
          </Tarjeta>
          <Tarjeta>
            <TarjetaCabecera titulo="Por cobrar" descripcion="Cobros que se dejaron pendientes, de cualquier día." />
            <TablaPagos pagos={pendientes} zona={config.zona_horaria} conFecha vacio={{ titulo: "Nada pendiente", detalle: "Todo lo que se abrió ya se cobró." }} />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
