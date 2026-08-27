import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Formulario } from "@/components/formulario";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { NavegarDia } from "@/components/navegar-dia";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { cambiarEstadoPago } from "@/lib/acciones";
import { negocio, pagosDelDia, pagosPendientes, resumenCobros } from "@/lib/consultas";
import { diaValido, fechaCorta, fechaLarga, hora, isoDia, moneda, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { NOMBRE_METODO, type MetodoPago, type Pago } from "@/lib/tipos";

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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Tarjeta>
            <TarjetaCabecera titulo="Cobros del día" descripcion="Cada cita o pedido que se cobró, con su método." />
            {pagos.length === 0 ? (
              <Vacio titulo="Sin cobros este día" detalle="Se registran desde la agenda al marcar una cita como atendida, o desde pedidos al entregar." />
            ) : (
              <ListaPagos pagos={pagos} zona={config.zona_horaria} />
            )}
          </Tarjeta>
          <Tarjeta>
            <TarjetaCabecera titulo="Por cobrar" descripcion="Cobros que se dejaron pendientes." />
            {pendientes.length === 0 ? <Vacio titulo="Nada pendiente" /> : <ListaPagos pagos={pendientes} zona={config.zona_horaria} conFecha />}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

function ListaPagos({ pagos, zona, conFecha = false }: { pagos: Pago[]; zona: string; conFecha?: boolean }) {
  return (
    <ul className="divide-y divide-linea">
      {pagos.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <div className="numeros w-[72px] shrink-0 font-mono text-[12px] text-tinta-3">
            {conFecha ? fechaCorta(p.creado, zona) : hora(p.pagado_en ?? p.creado, zona)}
          </div>
          <div className="min-w-[160px] flex-1">
            <p className="text-[13px] font-medium text-tinta">
              {p.cliente_id ? (
                <Link href={`/clientes/${p.cliente_id}`} className="transition hover:text-acento">
                  {p.cliente_nombre ?? "Sin nombre"}
                </Link>
              ) : (
                (p.cliente_nombre ?? "Sin nombre")
              )}
            </p>
            <p className="truncate text-[11.5px] text-tinta-3">
              {p.concepto}
              {p.referencia_externa ? ` · ${p.referencia_externa}` : ""}
            </p>
          </div>
          <span className="bg-panel-2 px-1.5 py-0.5 text-[11px] text-tinta-2">{NOMBRE_METODO[p.metodo]}</span>
          <span className={`numeros font-mono text-[14px] font-medium ${p.estado === "pagado" ? "text-tinta" : "text-alerta"}`}>{moneda(p.monto)}</span>
          {p.estado === "pendiente" ? (
            <div className="flex gap-1">
              <Formulario accion={cambiarEstadoPago}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="estado" value="pagado" />
                <button className="h-7 bg-bueno px-2.5 text-[12px] font-medium text-white transition hover:brightness-110">Ya pagó</button>
              </Formulario>
              <Formulario accion={cambiarEstadoPago}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="estado" value="cancelado" />
                <button className="h-7 px-2 text-[12px] text-tinta-3 transition hover:text-critico">Cancelar</button>
              </Formulario>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
