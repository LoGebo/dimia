import Link from "next/link";
import { Encabezado, Indicador } from "@/components/encabezado";
import { Refrescar } from "@/components/refrescar";
import { TableroPedidos } from "@/components/tablero-pedidos";
import { Vacio } from "@/components/ui/primitivos";
import { negocio, pedidosDelDia, resumenPedidos } from "@/lib/consultas";
import { fechaLarga, isoDia, moneda, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import type { EstadoPedido } from "@/lib/tipos";

const FILTROS: { valor: string; nombre: string }[] = [
  { valor: "pendientes", nombre: "Por sacar" },
  { valor: "abierto", nombre: "Sin cerrar" },
  { valor: "confirmado", nombre: "En cocina" },
  { valor: "entregado", nombre: "Entregados" },
  { valor: "cancelado", nombre: "Cancelados" },
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
  const dia = parametros.dia ?? hoy;
  const filtro = FILTROS.find((f) => f.valor === parametros.estado)?.valor ?? "pendientes";

  const [todos, resumen] = await Promise.all([pedidosDelDia(dia), resumenPedidos(dia)]);

  const visibles =
    filtro === "todos"
      ? todos
      : filtro === "pendientes"
        ? todos.filter((p) => p.estado === "abierto" || p.estado === "confirmado")
        : todos.filter((p) => p.estado === (filtro as EstadoPedido));

  const enlace = (cambios: { dia?: string; estado?: string }) =>
    `/pedidos?dia=${cambios.dia ?? dia}&estado=${cambios.estado ?? filtro}`;

  return (
    <>
      <Refrescar segundos={20} />
      <Encabezado
        titulo="Pedidos"
        descripcion={fechaLarga(`${dia}T12:00:00Z`, "UTC")}
        giro={giro.nombre}
        acciones={
          <div className="flex items-center gap-1">
            <Navegar destino={enlace({ dia: sumarDias(dia, -1) })} etiqueta="‹" />
            <Link
              href={enlace({ dia: hoy })}
              className="rounded-md border border-linea bg-panel px-2.5 py-1 text-xs text-tinta-2 transition hover:bg-panel-2"
            >
              Hoy
            </Link>
            <Navegar destino={enlace({ dia: sumarDias(dia, 1) })} etiqueta="›" />
          </div>
        }
      />

      <div className="space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-linea bg-linea lg:grid-cols-4">
          <Indicador etiqueta="Pedidos del día" valor={String(resumen.total)} detalle={`${resumen.cancelados} cancelados`} />
          <Indicador
            etiqueta="Por sacar"
            valor={String(resumen.abiertos + resumen.confirmados)}
            detalle={`${resumen.entregados} ya salieron`}
            tono={resumen.abiertos + resumen.confirmados > 0 ? "alerta" : "bueno"}
          />
          <Indicador etiqueta="Vendido" valor={moneda(resumen.vendido)} detalle="confirmados y entregados" />
          <Indicador etiqueta="Ticket promedio" valor={moneda(resumen.ticket)} detalle="por pedido cerrado" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={enlace({ estado: f.valor })}
              className={`rounded-lg border px-3.5 py-1.5 text-[15px] font-medium transition ${
                f.valor === filtro
                  ? "border-acento bg-acento-suave text-acento"
                  : "border-linea bg-panel text-tinta-2 hover:bg-panel-2"
              }`}
            >
              {f.nombre}
            </Link>
          ))}
        </div>

        {visibles.length === 0 ? (
          <div className="rounded-lg border border-linea bg-panel">
            <Vacio
              titulo="Nada aquí"
              detalle={
                todos.length === 0
                  ? "Ningún pedido entró este día. En cuanto el agente cierre uno por teléfono, aparece solo."
                  : "Ese filtro no tiene pedidos. Prueba con otro estado o con otro día."
              }
            />
          </div>
        ) : (
          <TableroPedidos pedidos={visibles} zona={config.zona_horaria} />
        )}
      </div>
    </>
  );
}

function Navegar({ destino, etiqueta }: { destino: string; etiqueta: string }) {
  return (
    <Link
      href={destino}
      className="flex h-[26px] w-7 items-center justify-center rounded-md border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2"
    >
      {etiqueta}
    </Link>
  );
}
