import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Chip, Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
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
              className="h-8 border border-linea bg-panel px-2.5 text-[12px] leading-[30px] text-tinta-2 transition hover:bg-panel-2"
            >
              Hoy
            </Link>
            <Navegar destino={enlace({ dia: sumarDias(dia, 1) })} etiqueta="›" />
          </div>
        }
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra
            etiqueta="Pedidos del día"
            valor={String(resumen.total)}
            glifo={Glifos.personas}
            pildora={resumen.cancelados > 0 ? `${resumen.cancelados} cancelados` : undefined}
            tono="neutro"
          />
          <Cifra
            etiqueta="Por sacar"
            valor={String(resumen.abiertos + resumen.confirmados)}
            glifo={Glifos.reloj}
            pildora={`${resumen.entregados} ya salieron`}
            tono={resumen.abiertos + resumen.confirmados > 0 ? "alerta" : "bueno"}
          />
          <Cifra etiqueta="Vendido" valor={moneda(resumen.vendido)} glifo={Glifos.dinero} pildora="confirmados y entregados" />
          <Cifra etiqueta="Ticket promedio" valor={moneda(resumen.ticket)} glifo={Glifos.dinero} pildora="por pedido cerrado" />
        </TiraIndicadores>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map((f) => (
            <Chip key={f.valor} activo={f.valor === filtro} href={enlace({ estado: f.valor })}>
              {f.nombre}
            </Chip>
          ))}
          <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">
            {visibles.length} de {todos.length} pedidos
          </span>
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
      className="flex h-8 w-8 items-center justify-center border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2"
    >
      {etiqueta}
    </Link>
  );
}
