import { Encabezado } from "@/components/encabezado";
import { Chip, Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { NavegarDia } from "@/components/navegar-dia";
import { Refrescar } from "@/components/refrescar";
import { TableroPedidos } from "@/components/tablero-pedidos";
import { VacioCompacto } from "@/components/kit/operacion";
import { negocio, pagosDePedidos, pedidosDelDia } from "@/lib/consultas";
import { diaValido, fechaLarga, isoDia, moneda, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { resumirPedidos, type EstadoPedido } from "@/lib/tipos";

const FILTROS: { valor: string; nombre: string; tono?: "alerta" | "bueno" | "critico" }[] = [
  { valor: "pendientes", nombre: "Por sacar" },
  { valor: "abierto", nombre: "Sin cerrar", tono: "alerta" },
  { valor: "confirmado", nombre: "En cocina" },
  { valor: "entregado", nombre: "Entregados", tono: "bueno" },
  { valor: "cancelado", nombre: "Cancelados", tono: "critico" },
  { valor: "todos", nombre: "Todos" },
];

export default async function Pedidos({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; estado?: string }>;
}) {
  const giro = await exigirSeccion("/pedidos");
  const parametros = await searchParams;
  const config = await negocio();
  const hoy = isoDia(new Date(), config.zona_horaria);
  const dia = diaValido(parametros.dia, hoy);
  const filtro = FILTROS.find((f) => f.valor === parametros.estado)?.valor ?? "pendientes";

  const todos = await pedidosDelDia(dia);
  const resumen = resumirPedidos(todos);
  const pagos = await pagosDePedidos(todos.map((p) => p.id));
  const cobrados = new Map(pagos.filter((p) => p.estado === "pagado" && p.pedido_id).map((p) => [p.pedido_id!, p.monto]));

  const filtrar = (valor: string) =>
    valor === "todos"
      ? todos
      : valor === "pendientes"
        ? todos.filter((p) => p.estado === "abierto" || p.estado === "confirmado")
        : todos.filter((p) => p.estado === (valor as EstadoPedido));
  const visibles = filtrar(filtro);

  const enlace = (cambios: { dia?: string; estado?: string }) =>
    `/pedidos?dia=${cambios.dia ?? dia}&estado=${cambios.estado ?? filtro}`;

  return (
    <>
      <Refrescar segundos={20} />
      <Encabezado
        titulo="Pedidos"
        descripcion={fechaLarga(`${dia}T12:00:00Z`, "UTC")}
        giro={giro.nombre}
        acciones={<NavegarDia anterior={enlace({ dia: sumarDias(dia, -1) })} hoy={enlace({ dia: hoy })} siguiente={enlace({ dia: sumarDias(dia, 1) })} />}
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra
            etiqueta="Pedidos del día"
            valor={String(resumen.total)}
            numero={resumen.total}
            glifo={Glifos.personas}
            pildora={resumen.cancelados > 0 ? `${resumen.cancelados} cancelados` : undefined}
            tono="neutro"
          />
          <Cifra
            etiqueta="Por sacar"
            valor={String(resumen.abiertos + resumen.confirmados)}
            numero={resumen.abiertos + resumen.confirmados}
            glifo={Glifos.reloj}
            pildora={`${resumen.entregados} ya salieron`}
            tono={resumen.abiertos + resumen.confirmados > 0 ? "alerta" : "bueno"}
          />
          <Cifra etiqueta="Vendido" valor={moneda(resumen.vendido)} numero={resumen.vendido} formato="moneda" glifo={Glifos.dinero} pildora="confirmados y entregados" />
          <Cifra etiqueta="Ticket promedio" valor={moneda(resumen.ticket)} numero={resumen.ticket ?? undefined} formato="moneda" glifo={Glifos.dinero} pildora="por pedido cerrado" />
        </TiraIndicadores>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map((f) => (
            <Chip key={f.valor} activo={f.valor === filtro} href={enlace({ estado: f.valor })} conteo={filtrar(f.valor).length} tono={f.tono}>
              {f.nombre}
            </Chip>
          ))}
          <span className="numeros ml-auto font-mono text-[10.5px] tracking-[0.18em] text-tinta-3 uppercase">
            {visibles.length} de {todos.length}
          </span>
        </div>

        {visibles.length === 0 ? (
          <div className="border border-linea bg-panel">
            <VacioCompacto
              titulo="Nada aquí"
              detalle={
                todos.length === 0
                  ? "Ningún pedido entró este día. En cuanto el agente cierre uno por teléfono, aparece solo."
                  : "Ese filtro no tiene pedidos. Prueba con otro estado o con otro día."
              }
            />
          </div>
        ) : (
          <TableroPedidos pedidos={visibles} zona={config.zona_horaria} cobrados={cobrados} />
        )}
      </div>
    </>
  );
}
