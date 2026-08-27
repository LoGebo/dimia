import { Cobrar } from "@/components/cobrar";
import { Formulario } from "@/components/formulario";
import { cambiarEstadoPedido } from "@/lib/acciones";
import { hora, moneda, telefono } from "@/lib/formato";
import type { EstadoPedido, Pedido, TipoPedido } from "@/lib/tipos";

const MINUTOS_NUEVO = 10;

const ESTADOS: Record<EstadoPedido, { nombre: string; clase: string }> = {
  abierto: { nombre: "Sin cerrar", clase: "border-alerta/40 bg-alerta/10 text-alerta" },
  confirmado: { nombre: "En cocina", clase: "border-acento/40 bg-acento-suave text-acento" },
  entregado: { nombre: "Entregado", clase: "border-bueno/40 bg-bueno/10 text-bueno" },
  cancelado: { nombre: "Cancelado", clase: "border-critico/40 bg-critico/10 text-critico" },
};

const TIPOS: Record<TipoPedido, string> = {
  recoger: "Pasan por él",
  domicilio: "A domicilio",
  local: "Para comer aquí",
};

export function TableroPedidos({ pedidos, zona, cobrados = new Map() }: { pedidos: Pedido[]; zona: string; cobrados?: Map<string, string> }) {
  const ahora = Date.now();
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {pedidos.map((p) => (
        <TarjetaPedido key={p.id} pedido={p} zona={zona} ahora={ahora} cobrado={cobrados.get(p.id) ?? null} />
      ))}
    </div>
  );
}

function TarjetaPedido({ pedido, zona, ahora, cobrado }: { pedido: Pedido; zona: string; ahora: number; cobrado: string | null }) {
  const minutos = Math.max(0, Math.round((ahora - new Date(pedido.creado).getTime()) / 60000));
  const pendiente = pedido.estado === "abierto" || pedido.estado === "confirmado";
  const nuevo = pendiente && minutos < MINUTOS_NUEVO;
  const estado = ESTADOS[pedido.estado];

  return (
    <article
      className={`flex flex-col overflow-hidden border bg-panel ${
        nuevo ? "late border-serie-2" : "border-linea"
      } ${pedido.estado === "cancelado" ? "opacity-60" : ""}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3">
        <div className="min-w-0">
          <p className="numeros text-[30px] leading-none font-bold tracking-[0.12em] text-tinta">
            {pedido.codigo}
          </p>
          <p className="numeros mt-1.5 text-[13px] text-tinta-3">
            {hora(pedido.creado, zona)} · hace {minutos} min
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`border px-2 py-0.5 text-[13px] font-semibold ${estado.clase}`}>
            {estado.nombre}
          </span>
          {nuevo ? (
            <span className="bg-serie-2 px-2 py-0.5 text-[11px] font-bold tracking-widest text-white uppercase">
              Nuevo
            </span>
          ) : null}
        </div>
      </header>

      <div className="border-b border-linea px-4 py-2.5">
        <p className="truncate text-[17px] font-semibold text-tinta">
          {pedido.cliente_nombre ?? "Sin nombre todavía"}
        </p>
        <p className="numeros text-[15px] text-tinta-2">{telefono(pedido.telefono)}</p>
        <p className="mt-1.5 text-[15px] font-medium text-tinta">
          {TIPOS[pedido.tipo]}
          {pedido.tipo === "domicilio" ? (
            <span className="block text-[15px] font-normal text-tinta-2">
              {pedido.direccion ?? "Falta la dirección"}
            </span>
          ) : null}
        </p>
      </div>

      <ul className="flex-1 divide-y divide-linea">
        {pedido.items.map((item, i) => (
          <li key={`${item.nombre}-${i}`} className="flex items-baseline gap-3 px-4 py-2">
            <span className="numeros w-9 shrink-0 text-[22px] leading-none font-bold text-tinta">
              {item.cantidad}×
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] leading-tight text-tinta">{item.nombre}</span>
              {item.notas ? (
                <span className="block text-[15px] leading-tight font-medium text-serie-2">{item.notas}</span>
              ) : null}
            </span>
            <span className="numeros shrink-0 text-[15px] text-tinta-2">{moneda(item.subtotal)}</span>
          </li>
        ))}
        {pedido.items.length === 0 ? (
          <li className="px-4 py-3 text-[15px] text-tinta-3">Todavía no le agregaron nada.</li>
        ) : null}
      </ul>

      {pedido.notas ? (
        <p className="border-t border-linea px-4 py-2 text-[15px] text-serie-2">{pedido.notas}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-linea bg-panel-2 px-4 py-3">
        <span className="etiqueta">{cobrado ? "Cobrado" : "Total"}</span>
        <span className={`numeros text-[26px] leading-none font-bold ${cobrado ? "text-bueno" : "text-tinta"}`}>{moneda(cobrado ?? pedido.total)}</span>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-linea px-4 py-3">
        {pedido.estado === "abierto" ? (
          <BotonEstado id={pedido.id} estado="confirmado" tono="acento">
            Pasar a cocina
          </BotonEstado>
        ) : null}
        {pedido.estado === "confirmado" ? (
          <BotonEstado id={pedido.id} estado="entregado" tono="bueno">
            Marcar entregado
          </BotonEstado>
        ) : null}
        {pedido.estado !== "cancelado" && !cobrado && pedido.items.length > 0 && Number(pedido.total) > 0 ? (
          <Cobrar pedidoId={pedido.id} concepto={`Pedido ${pedido.codigo}`} montoSugerido={pedido.total} etiqueta="Cobrar" />
        ) : null}
        {pendiente ? (
          <BotonEstado id={pedido.id} estado="cancelado" tono="critico">
            Cancelar
          </BotonEstado>
        ) : (
          <BotonEstado id={pedido.id} estado="confirmado" tono="neutro">
            Regresar a cocina
          </BotonEstado>
        )}
      </div>
    </article>
  );
}

const TONOS = {
  acento: "bg-acento text-acento-tinta border-transparent hover:brightness-110",
  bueno: "bg-bueno text-white border-transparent hover:brightness-110",
  critico: "bg-transparent text-critico border-critico/40 hover:bg-critico/10",
  neutro: "bg-panel text-tinta-2 border-linea-fuerte hover:bg-panel-2",
} as const;

function BotonEstado({
  id,
  estado,
  tono,
  children,
}: {
  id: string;
  estado: EstadoPedido;
  tono: keyof typeof TONOS;
  children: string;
}) {
  return (
    <Formulario accion={cambiarEstadoPedido} className={tono === "critico" || tono === "neutro" ? "" : "flex-1"}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button
        className={`inline-flex h-11 w-full items-center justify-center border px-4 text-[15px] font-semibold transition ${TONOS[tono]}`}
      >
        {children}
      </button>
    </Formulario>
  );
}
